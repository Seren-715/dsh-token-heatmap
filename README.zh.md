# dsh-token-heatmap

中文 | [English](README.md)

在 DSH **设置**里增加一节「Token 用量」：每日 token 消耗热力图，一格一天，颜色越深那天用得越多。

数据全部来自本机 DSH 自己的会话日志，**不联网、不需要额外记账**。

> **隐私**：本插件不发起任何外部请求。会话日志只在本机读取，聚合结果只交给本机的 DSH 页面。
> 仓库里没有任何个人数据或密钥。

## 界面示例

以下为旧版界面截图，仅供安装位置与本地化参考；当前版默认半年，全年分两排，并支持下方日详情。

设置 → **Token 用量**（旧版英文界面）：

![英文界面](docs/screenshot-en.png)

同一个页面切到中文——所有标签、月份刻度、数字单位都跟着语言走：

![中文界面](docs/screenshot-zh.png)

## 功能

- 默认近半年（26 周）；可切换近一年，全年分为上下两排（27 + 26 周），各排带月份刻度
- 格子上限 20px、间距 4px，按容器宽度适配，避免横向滚动条
- **每天 / 每周**：每日独立色阶，或同一自然周整列同色；周日到周六排列，未来日期留空
- **四种口径**：总量 / 输入+输出 / 缓存读 / 输出；使用主题灰阶表示相对高低
- 悬浮或聚焦仅显示当前口径的 Token 数量和「点击查看详情」；周视图标注本周数量
- 点击日期，在下方原位显示当天总量、输入、输出、缓存读取、调用次数，以及非零缓存写入；周视图点击仍查看所点日期
- Token 构成条按实际数量展示各分项及比例；没有用量时显示空状态
- 首次加载斜向铺开约 600ms，顶部统计不等待动画；切换口径、范围或选择日期不重播
- 原生按钮支持 Enter/Space，保留焦点反馈；尊重系统减少动态效果设置
- 摘要显示今日 / 本周 / 全部历史合计；每分钟刷新，窗口重新可见或聚焦时补拉
- 中英文文案、月份、数字单位跟随宿主语言，深浅主题跟随宿主

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

「总量」包含日志报告的缓存读取，缓存占比随使用情况变化。「输入+输出」仅统计这两项，不等于账单金额；插件不进行费用换算。

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
| `tools/test-client.mjs` | 用 React 钩子桩验证客户端渲染与交互 |
| `tools/test-weekly.mjs` | 验算每周聚合：周边界、跨月刻度、不重复计数 |

需要支持 `node:zlib` 的 `zstdDecompressSync` 的 Node.js（建议 Node.js 24）。客户端逻辑与周聚合测试不需要真实日志；宿主聚合测试需要本机日志，可通过 `DSH_SESSIONS_ROOT` 指定路径。

自测：

```bash
node tools/test-client.mjs
node tools/test-plugin.mjs
node tools/test-apply.mjs
node tools/test-weekly.mjs
```

## 实现要点

**UI 走 slot，不自己塞 DOM。** 组件注册进 `settings.section`，只渲染 React 元素；
不 import 任何 Harness Client 包，样式自己写、只用主题变量。
（DSH 插件规范明确禁止往 `document.body` 追加元素或替换应用根节点。）

**自适应尺寸。** `ResizeObserver` 量容器宽度，算出每格边长写进 CSS 变量 `--dth-cell`：
半年按 26 列适配，全年按每排最多 27 列适配；格子上限 20px，计算时扣除间距和内边距。

**周对齐。** 从当前周的周日向前倒推 25 周或 52 周，因此每列都是完整自然周；今天之后的格子留空。
月份刻度贴在"包含该月 1 号"的那一列，所以永远与列对齐。

**本地化。** 可见文案一律不写死：插件用 `ctx.locale.register(ns, { zh, en })` 注册自己的命名空间字典，
再通过框架注入的 `t` 席位读取，所以切语言时这一节会重渲染。数字单位也跟着走（中文 `万/亿`，英文 `K/M/B`）。

客户端测试直接执行 `client.js`，使用 React 钩子桩覆盖首次可见帧、精简 Tooltip、页内详情、范围切换和构成条；不替代真实 DSH 中的布局、动画、焦点与主题验收。

更新内容见 [CHANGELOG.md](CHANGELOG.md)。

## License

MIT
