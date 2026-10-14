# dsh-token-heatmap

中文 | [English](README.md)

在 DSH **设置**里增加一节「Token 用量」：每日 token 消耗热力图，一格一天，颜色越深那天用得越多。

数据全部来自本机 DSH 自己的会话日志，**不联网、不需要额外记账**。

> **隐私**：本插件不发起任何外部请求。会话日志只在本机读取，聚合结果只交给本机的 DSH 页面。
> 仓库里没有任何个人数据或密钥。

## 功能

- **每天 / 每周**两种口径切换：一格一天，或一格一周（整列同色）
- **四种 token 口径**：总量 / 输入+输出 / 缓存读 / 输出
- 近一年 **53 列 × 7 行**，起点按自然周对齐（周日→周六），今天之后的格子留空
- 格子尺寸**按容器宽度自适应**（7–13px），永远铺满、不裁边、不出滚动条
- 悬浮看单日/单周明细（总量、输入、输出、缓存读、调用次数）
- 摘要行显示今日 / 本周 / 合计
- 每分钟自动刷新；切回窗口或页面重新可见时立刻补拉
- 深浅色跟随宿主主题；样式只用 `--dsw-alias-*` 变量

## 数据来源

`<DSH_HOME>/sessions/<项目>/<会话>/session.v*.jsonl.zstd`

每条助手消息都带 `data.usage`：

```
inputTokens / outputTokens / cacheReadTokens / cacheWriteTokens / totalTokens
```

外加 `time`（epoch 毫秒）与 `data.message.source.model`，按本地日历日聚合即得每日用量。

三个必须处理好的细节：

1. **日志是多帧拼接的 zstd** —— 一次性解压只能拿到第一帧，必须按帧魔数逐帧解压。
2. **同一 `seq` 可能重复出现**（回放）—— 按 seq 去重，否则某天的数字会被灌水。
3. **会话写入中尾部可能出现截断帧** —— 只跳过那一帧，不要丢掉整个文件。

宿主侧按 `size + mtime` 做文件级缓存，命中约 4–5ms，只有新增或改动的日志会被重新解析。

### 关于口径

DeepSeek 的 `totalTokens` 里**缓存读通常占 95% 以上**，所以"总量"这一档主要反映缓存命中量。
想知道实际花了多少，选**「输入+输出」**。

颜色分级用**分位数**（你自己数据的 25/50/75/95 分位），不是绝对阈值，所以切换口径时量级差几十倍，热力图依然有可读的层次。

## 安装

桌面应用的 profile 由应用独占管理，`dsh plugin` 命令会拒绝改它，所以要在应用里装：

1. 打开 DSH → 侧栏 **插件** → **添加插件**
2. 填入本目录的绝对路径（命令行形式是 `dsh plugin add "link:<路径>"`）
3. 安装后重启应用
4. 进 **设置**，导航里会多出「Token 用量」

卸载：同一页面的组合包卡片 → 卸载。

## 配置

可选，写在 bundle 行的 `config` 里，不填就用默认值。

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `timeZone` | `Asia/Shanghai` | 按哪个时区切"一天" |
| `sessionsRoot` | `<DSH_HOME>/sessions` | 会话日志根目录 |
| `maxDepth` | `2` | 目录下钻深度（项目 / 会话两层） |

## 结构

| 路径 | 说明 |
| --- | --- |
| `lib/index.js` | 宿主侧：逐帧解压会话日志、按天聚合、注册 `/dsh-token-heatmap/data` |
| `client.js` | 浏览器侧：注册进 `settings.section` 的 React 组件（热力图与切换） |
| `package.json` | 清单：`dsh.bundle.patch` 声明挂载，`dsh.client` 声明浏览器半侧 |
| `cordis.patch.yml` | 挂载声明；`insert` 的 `name` 必须与包名完全一致 |
| `tools/test-plugin.mjs` | 拿真实会话日志跑宿主侧聚合 |
| `tools/test-apply.mjs` | 用桩 Cordis 上下文跑 `apply()`，验证路由注册 |
| `tools/test-weekly.mjs` | 验算每周聚合：周边界、跨月刻度、不重复计数 |

自测（需要本机已有 DSH 会话日志）：

```bash
node tools/test-plugin.mjs
node tools/test-apply.mjs
node tools/test-weekly.mjs
```

## 实现要点

**UI 走 slot，不自己塞 DOM。** 组件注册进 `settings.section`，只渲染 React 元素；
不 import 任何 Harness Client 包，样式自己写、只用主题变量。
（DSH 插件规范明确禁止往 `document.body` 追加元素或替换应用根节点。）

**自适应尺寸。** `ResizeObserver` 量容器宽度，算出每格边长写进 CSS 变量 `--dth-cell`：
一年 53 列在 640–900px 宽度下分别得到 9–13px 的格子，永远刚好放下。

**周对齐。** 起点取"今天所在周的周日"，因此每列都是完整自然周；今天之后的格子留空。
月份刻度贴在"包含该月 1 号"的那一列，所以永远与列对齐。

## License

MIT
