/**
 * dsh-token-heatmap —— 宿主侧插件
 *
 * 统计"你在 DSH 里每天花了多少 token"，把结果交给 Web 页面上的热力图。
 *
 * 数据来源是 DSH 自己的会话日志：`<DSH_HOME>/sessions/<项目>/<会话>/session.v*.jsonl.zstd`。
 * 每条助手消息都带 `data.usage`（inputTokens / outputTokens / cacheReadTokens /
 * cacheWriteTokens / totalTokens）和 `time`（epoch 毫秒），所以按天聚合不需要另建账本。
 * 日志是**多帧拼接的 zstd**，必须逐帧解压，一次性解压只能拿到第一帧。
 *
 * 挂载方式与当前 DSH 版本上已经跑通的插件一致：
 *   ① `webserver/index-inject` 推一行内联脚本，由它自己建 `<script src="/dsh-token-heatmap/client.js">`；
 *   ② `webServer.register` 伺服前端脚本与 `/dsh-token-heatmap/data` 数据接口。
 * 内联行是桌面端唯一能生效的通道（安装包静态 dist 的 index.html 过不了 tapIndex），
 * 而自己建 script 并吞掉 onerror，可以让路由缺失时静默失败，永远不会拖垮应用启动。
 */

import { zstdDecompressSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTE_PREFIX = '/dsh-token-heatmap';
const CLIENT_PATH = `${ROUTE_PREFIX}/client.js`;
const DATA_PATH = `${ROUTE_PREFIX}/data`;
const SESSION_FILE = /^session\.v\d+\.jsonl\.zstd$/;
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** 历史缓存：文件签名 -> 该文件的逐日聚合。增量扫描靠它避免每次重读全部日志。 */
const fileCache = new Map();

/**
 * 一个 zstd 文件里解析出的逐日用量。
 * @typedef {object} DayUsage
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} cacheReadTokens
 * @property {number} cacheWriteTokens
 * @property {number} totalTokens
 * @property {number} calls
 */

/**
 * 逐帧解压多帧 zstd。
 *
 * 会话日志是**多帧拼接**的，一次性解压只能拿到第一帧，所以按帧魔数手动切分。
 * 单帧失败只跳过那一帧：会话正在写入时尾部可能是截断帧，不该丢掉整个文件。
 * @param {Buffer} raw - 文件原始字节。
 * @returns {string} 解压后的文本。
 */
function decompressLog(raw) {
  const starts = [];
  let index = raw.indexOf(ZSTD_MAGIC, 0);
  while (index !== -1) {
    starts.push(index);
    index = raw.indexOf(ZSTD_MAGIC, index + 1);
  }
  if (starts.length === 0) {
    try {
      return zstdDecompressSync(raw).toString('utf8');
    } catch {
      return '';
    }
  }
  starts.push(raw.length);
  const parts = [];
  for (let frame = 0; frame + 1 < starts.length; frame += 1) {
    try {
      parts.push(zstdDecompressSync(raw.subarray(starts[frame], starts[frame + 1])));
    } catch {
      // 截断的尾帧：跳过。
    }
  }
  return Buffer.concat(parts).toString('utf8');
}

/**
 * 本地日历日（YYYY-MM-DD）。
 * @param {number} ms - epoch 毫秒。
 * @param {string} timeZone - IANA 时区。
 * @returns {string}
 */
function dayOf(ms, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(ms));
}

/**
 * 解析一个会话日志，得到逐日用量。
 *
 * 同一 `seq` 在日志里可能出现多次（回放），所以按 seq 去重；重复计数会把某一天灌水。
 * @param {string} text - 解压后的 JSONL 文本。
 * @param {string} timeZone - IANA 时区。
 * @returns {{days: Map<string, DayUsage>, models: Map<string, number>, records: number}}
 */
function parseUsage(text, timeZone) {
  const days = new Map();
  const models = new Map();
  const seen = new Set();
  let records = 0;

  const bump = (day, usage) => {
    const current = days.get(day) ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      calls: 0
    };
    current.inputTokens += Number(usage.inputTokens) || 0;
    current.outputTokens += Number(usage.outputTokens) || 0;
    current.cacheReadTokens += Number(usage.cacheReadTokens) || 0;
    current.cacheWriteTokens += Number(usage.cacheWriteTokens) || 0;
    current.totalTokens += Number(usage.totalTokens)
      || (Number(usage.inputTokens) || 0) + (Number(usage.outputTokens) || 0)
      + (Number(usage.cacheReadTokens) || 0) + (Number(usage.cacheWriteTokens) || 0);
    current.calls += 1;
    days.set(day, current);
  };

  for (const line of text.split('\n')) {
    if (line.length === 0 || !line.includes('"usage"')) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const usage = record?.data?.usage;
    const time = record?.time;
    if (usage === null || typeof usage !== 'object' || typeof time !== 'number' || !Number.isFinite(time)) continue;
    const seqKey = String(record.seq ?? '');
    if (seqKey !== '' && seen.has(seqKey)) continue;
    if (seqKey !== '') seen.add(seqKey);
    records += 1;
    const day = dayOf(time, timeZone);
    bump(day, usage);
    const model = record?.data?.message?.source?.model ?? 'unknown';
    models.set(model, (models.get(model) ?? 0) + (Number(usage.totalTokens) || 0));
  }

  return { days, models, records };
}

/**
 * 递归收集会话日志。
 * @param {string} root - sessions 根目录。
 * @param {number} maxDepth - 下钻深度（项目/会话两层）。
 * @returns {string[]}
 */
function listSessionFiles(root, maxDepth) {
  const found = [];
  const walk = (current, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (SESSION_FILE.test(entry.name)) found.push(path);
    }
  };
  walk(root, 0);
  return found;
}

/**
 * 汇总所有会话日志的每日用量。带文件级缓存，只有新增或改动的日志会被重新解析。
 * @param {object} options - 数据源配置。
 * @param {string} options.sessionsRoot - 会话日志根目录。
 * @param {string} options.timeZone - IANA 时区。
 * @param {number} options.maxDepth - 目录下钻深度。
 * @returns {object} 供接口返回的载荷。
 */
export function collectUsage({ sessionsRoot, timeZone, maxDepth }) {
  const files = listSessionFiles(sessionsRoot, maxDepth);
  const alive = new Set();
  const days = new Map();
  const models = new Map();
  let records = 0;

  for (const file of files) {
    let signature;
    try {
      const stats = statSync(file);
      signature = `${stats.size}:${stats.mtimeMs}`;
    } catch {
      continue;
    }
    alive.add(file);
    let cached = fileCache.get(file);
    if (cached === undefined || cached.signature !== signature) {
      let parsed = { days: new Map(), models: new Map(), records: 0 };
      try {
        parsed = parseUsage(decompressLog(readFileSync(file)), timeZone);
      } catch {
        parsed = { days: new Map(), models: new Map(), records: 0 };
      }
      cached = { signature, days: parsed.days, models: parsed.models, records: parsed.records };
      fileCache.set(file, cached);
    }
    records += cached.records;
    for (const [day, usage] of cached.days) {
      const current = days.get(day) ?? {
        day,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        calls: 0
      };
      current.inputTokens += usage.inputTokens;
      current.outputTokens += usage.outputTokens;
      current.cacheReadTokens += usage.cacheReadTokens;
      current.cacheWriteTokens += usage.cacheWriteTokens;
      current.totalTokens += usage.totalTokens;
      current.calls += usage.calls;
      days.set(day, current);
    }
    for (const [model, tokens] of cached.models) models.set(model, (models.get(model) ?? 0) + tokens);
  }

  for (const file of [...fileCache.keys()]) {
    if (!alive.has(file)) fileCache.delete(file);
  }

  const list = [...days.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  return {
    generatedAt: new Date().toISOString(),
    timeZone,
    sessionsRoot,
    files: files.length,
    records,
    totalTokens: list.reduce((sum, day) => sum + day.totalTokens, 0),
    days: list,
    models: [...models.entries()]
      .map(([model, tokens]) => ({ model, tokens }))
      .sort((a, b) => b.tokens - a.tokens)
  };
}

/**
 * 解析会话日志根目录。
 *
 * 按请求时求值而不是加载时求值：宿主可能在插件加载之后才设置 DSH_HOME，
 * 而插件上下文里可能已经存着一份更准确的 DSH_HOME 配置。
 * @param {object} config - 插件配置。
 * @param {object|undefined} context - 插件上下文，可取 DSH_HOME 配置。
 * @returns {string}
 */
function resolveSessionsRoot(config, context) {
  if (typeof config.sessionsRoot === 'string' && config.sessionsRoot !== '') return config.sessionsRoot;
  const fromContext = typeof context?.get === 'function' ? context.get('DSH_HOME') : undefined;
  const home = (typeof fromContext === 'string' && fromContext !== '' ? fromContext : undefined)
    ?? process.env.DSH_HOME
    ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh');
  return join(home, 'sessions');
}

/**
 * 读取浏览器端模块。它由 `dsh.client` 声明的模块加载机制取用，不需要
 * 宿主再往页面里插脚本——那套注入是浮层方案遗留的，已弃用。
 * @param {string} packageRoot - 包根目录。
 * @returns {string}
 */
function readClientScript(packageRoot) {
  return readFileSync(join(packageRoot, 'client.js'), 'utf8');
}

export const name = 'dsh-token-heatmap';

export function apply(ctx) {
  const disposers = [];

  /**
   * 注册一条路由；任何失败都只影响这一条，并且记到宿主控制台。
   *
   * 这里刻意不依赖注入作用域上的可选成员（`scoped.effect` / `scoped.config` /
   * `scoped.logger`）：先前版本就是因为其中某个不存在而整段注册中断，
   * 表现为"插件运行中、路由一个没有"。
   */
  const routeDisposers = [];
  const registerRoute = (webServer, route) => {
    try {
      if (webServer === undefined || webServer === null || typeof webServer.register !== 'function') {
        console.warn(`dsh-token-heatmap: webServer unavailable, ${route.path} not registered`);
        return;
      }
      const dispose = webServer.register(route);
      if (typeof dispose === 'function') routeDisposers.push(dispose);
    } catch (error) {
      console.warn(`dsh-token-heatmap: failed to register ${route.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const clientScript = () => readClientScript(fileURLToPath(new URL('..', import.meta.url)));

  const respond = (res, status, headers, body) => {
    try {
      res.writeHead(status, headers);
      res.end(body);
    } catch (error) {
      console.warn(`dsh-token-heatmap: response failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // ② 路由：等 webServer 就绪。回调里的每一步都单独兜底。
  ctx.inject(['webServer'], (scoped) => {
    const webServer = scoped?.webServer ?? (typeof scoped?.get === 'function' ? scoped.get('webServer') : undefined);

    registerRoute(webServer, {
      kind: 'exact',
      path: CLIENT_PATH,
      handler: (_req, res) => {
        try {
          respond(res, 200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }, clientScript());
        } catch (error) {
          respond(res, 500, { 'content-type': 'text/plain; charset=utf-8' }, `dsh-token-heatmap: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    });

    registerRoute(webServer, {
      kind: 'exact',
      path: DATA_PATH,
      handler: async (_req, res) => {
        try {
          // 配置与路径都在请求时解析，任何一处缺失都退化成默认值而不是抛错。
          let config = {};
          try {
            config = scoped?.config ?? {};
          } catch {
            config = {};
          }
          const payload = collectUsage({
            sessionsRoot: resolveSessionsRoot(config, scoped),
            timeZone: typeof config.timeZone === 'string' ? config.timeZone : 'Asia/Shanghai',
            maxDepth: Number(config.maxDepth) || 2
          });
          respond(res, 200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, JSON.stringify(payload));
        } catch (error) {
          console.warn(`dsh-token-heatmap: data route failed: ${error instanceof Error ? error.message : String(error)}`);
          respond(res, 500, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      }
    });

    console.info(`dsh-token-heatmap: ${String(routeDisposers.length)} route(s) registered`);
  });

  // 卸载：注入行与路由一起撤。用 `dispose` 事件而不是注入作用域上的 effect，
  // 后者在注入作用域里不保证存在。
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose();
      } catch {
        // 卸载路径上的失败不该再抛。
      }
    }
    for (const dispose of routeDisposers.splice(0)) {
      try {
        dispose();
      } catch {
        // 同上。
      }
    }
  });
}
