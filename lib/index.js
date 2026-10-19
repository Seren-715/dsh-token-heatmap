/**
 * Host-side DSH Token usage plugin.
 * Reads local session logs, aggregates daily usage and registers HTTP routes.
 * The browser module is loaded through the manifest's `dsh.client` declaration.
 */

import { zstdDecompressSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENCY, PRICING_META, costFromUnits, recordCostUnits } from './pricing.js';

const ROUTE_PREFIX = '/dsh-token-heatmap';
const CLIENT_PATH = `${ROUTE_PREFIX}/client.js`;
const DATA_PATH = `${ROUTE_PREFIX}/data`;
const SESSION_FILE = /^session\.v\d+\.jsonl\.zstd$/;
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** 文件缓存：按文件签名复用逐日聚合结果。 */
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
 * @property {number} costUnits - 金额，单位 1e-8 元。
 */

/**
 * 逐帧解压多帧 zstd。
 *
 * 依据 zstd 帧魔数划分日志，并分别解压可读取的帧。
 * 写入过程中的尾帧可能不完整；单帧失败时保留其他帧的解析结果。
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
 * 同一 `seq` 在日志里可能出现多次（回放），所以按 seq 去重；避免重复计数。
 * @param {string} text - 解压后的 JSONL 文本。
 * @param {string} timeZone - IANA 时区。
 * @returns {{days: Map<string, DayUsage>, models: Map<string, {tokens: number, costUnits: number, assumed: boolean}>, records: number}}
 */
function parseUsage(text, timeZone) {
  const days = new Map();
  const models = new Map();
  const seen = new Set();
  let records = 0;

  const bump = (day, usage, costUnits) => {
    const current = days.get(day) ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      calls: 0,
      costUnits: 0
    };
    current.inputTokens += Number(usage.inputTokens) || 0;
    current.outputTokens += Number(usage.outputTokens) || 0;
    current.cacheReadTokens += Number(usage.cacheReadTokens) || 0;
    current.cacheWriteTokens += Number(usage.cacheWriteTokens) || 0;
    current.totalTokens +=
      Number(usage.totalTokens) ||
      (Number(usage.inputTokens) || 0) +
        (Number(usage.outputTokens) || 0) +
        (Number(usage.cacheReadTokens) || 0) +
        (Number(usage.cacheWriteTokens) || 0);
    current.calls += 1;
    current.costUnits += costUnits;
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
    if (
      usage === null ||
      typeof usage !== 'object' ||
      typeof time !== 'number' ||
      !Number.isFinite(time)
    )
      continue;
    const seqKey = String(record.seq ?? '');
    if (seqKey !== '' && seen.has(seqKey)) continue;
    if (seqKey !== '') seen.add(seqKey);
    records += 1;
    const day = dayOf(time, timeZone);
    const model = record?.data?.message?.source?.model ?? 'unknown';
    const cost = recordCostUnits(usage, model, time);
    bump(day, usage, cost.units);
    const entry = models.get(model) ?? { tokens: 0, costUnits: 0, assumed: false };
    entry.tokens += Number(usage.totalTokens) || 0;
    entry.costUnits += cost.units;
    entry.assumed = entry.assumed || cost.assumed;
    models.set(model, entry);
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
    if (cached === undefined || cached.signature !== signature || cached.timeZone !== timeZone) {
      let parsed = { days: new Map(), models: new Map(), records: 0 };
      try {
        parsed = parseUsage(decompressLog(readFileSync(file)), timeZone);
      } catch {
        parsed = { days: new Map(), models: new Map(), records: 0 };
      }
      cached = {
        signature,
        timeZone,
        days: parsed.days,
        models: parsed.models,
        records: parsed.records
      };
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
        calls: 0,
        costUnits: 0
      };
      current.inputTokens += usage.inputTokens;
      current.outputTokens += usage.outputTokens;
      current.cacheReadTokens += usage.cacheReadTokens;
      current.cacheWriteTokens += usage.cacheWriteTokens;
      current.totalTokens += usage.totalTokens;
      current.calls += usage.calls;
      current.costUnits += usage.costUnits;
      days.set(day, current);
    }
    for (const [model, entry] of cached.models) {
      const current = models.get(model) ?? { tokens: 0, costUnits: 0, assumed: false };
      current.tokens += entry.tokens;
      current.costUnits += entry.costUnits;
      current.assumed = current.assumed || entry.assumed;
      models.set(model, current);
    }
  }

  for (const file of [...fileCache.keys()]) {
    if (!alive.has(file)) fileCache.delete(file);
  }

  const list = [...days.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const totalCostUnits = list.reduce((sum, day) => sum + day.costUnits, 0);
  const assumedModels = [...models.entries()]
    .filter(([, entry]) => entry.assumed)
    .map(([model]) => model)
    .sort();
  return {
    generatedAt: new Date().toISOString(),
    timeZone,
    sessionsRoot,
    files: files.length,
    records,
    totalTokens: list.reduce((sum, day) => sum + day.totalTokens, 0),
    // 金额为按官方价目表估算，单位由 currency 标注。
    currency: CURRENCY,
    totalCost: costFromUnits(totalCostUnits),
    pricing: { ...PRICING_META, assumedModels },
    days: list.map(({ costUnits, ...day }) => ({ ...day, cost: costFromUnits(costUnits) })),
    models: [...models.entries()]
      .map(([model, entry]) => ({
        model,
        tokens: entry.tokens,
        cost: costFromUnits(entry.costUnits),
        assumed: entry.assumed
      }))
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
  if (typeof config.sessionsRoot === 'string' && config.sessionsRoot !== '')
    return config.sessionsRoot;
  const fromContext = typeof context?.get === 'function' ? context.get('DSH_HOME') : undefined;
  const home =
    (typeof fromContext === 'string' && fromContext !== '' ? fromContext : undefined) ??
    process.env.DSH_HOME ??
    join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh');
  return join(home, 'sessions');
}

/**
 * 读取由 `dsh.client` 声明的浏览器端模块。
 * @param {string} packageRoot - 包根目录。
 * @returns {string}
 */
function readClientScript(packageRoot) {
  return readFileSync(join(packageRoot, 'client.js'), 'utf8');
}

export const name = 'dsh-token-heatmap';

export function apply(ctx) {
  // Register routes independently and retain their cleanup callbacks.
  const routeDisposers = [];
  const registerRoute = (webServer, route) => {
    try {
      if (
        webServer === undefined ||
        webServer === null ||
        typeof webServer.register !== 'function'
      ) {
        console.warn(`dsh-token-heatmap: webServer unavailable, ${route.path} not registered`);
        return;
      }
      const dispose = webServer.register(route);
      if (typeof dispose === 'function') routeDisposers.push(dispose);
    } catch (error) {
      console.warn(
        `dsh-token-heatmap: failed to register ${route.path}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const clientScript = () => readClientScript(fileURLToPath(new URL('..', import.meta.url)));

  const respond = (res, status, headers, body) => {
    try {
      res.writeHead(status, headers);
      res.end(body);
    } catch (error) {
      console.warn(
        `dsh-token-heatmap: response failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  // Register HTTP routes after the host web server becomes available.
  ctx.inject(['webServer'], (scoped) => {
    const webServer =
      scoped?.webServer ??
      (typeof scoped?.get === 'function' ? scoped.get('webServer') : undefined);

    registerRoute(webServer, {
      kind: 'exact',
      path: CLIENT_PATH,
      handler: (_req, res) => {
        try {
          respond(
            res,
            200,
            { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' },
            clientScript()
          );
        } catch (error) {
          respond(
            res,
            500,
            { 'content-type': 'text/plain; charset=utf-8' },
            `dsh-token-heatmap: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    });

    registerRoute(webServer, {
      kind: 'exact',
      path: DATA_PATH,
      handler: async (_req, res) => {
        try {
          // Resolve configuration and source paths for each request.
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
          respond(
            res,
            200,
            { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
            JSON.stringify(payload)
          );
        } catch (error) {
          console.warn(
            `dsh-token-heatmap: data route failed: ${error instanceof Error ? error.message : String(error)}`
          );
          respond(
            res,
            500,
            { 'content-type': 'application/json; charset=utf-8' },
            JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
          );
        }
      }
    });

    console.info(`dsh-token-heatmap: ${String(routeDisposers.length)} route(s) registered`);
  });

  // Dispose registered routes when the plugin unloads.
  ctx.effect(() => () => {
    for (const dispose of routeDisposers.splice(0)) {
      try {
        dispose();
      } catch {
        // Continue disposing the remaining routes.
      }
    }
  });
}
