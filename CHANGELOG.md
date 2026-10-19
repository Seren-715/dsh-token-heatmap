# Changelog

## 0.5.0 — 2026-10-19

- 新增**当日消费金额估算**：详情页在当日总量旁显示人民币估算金额。
- 新增 `lib/pricing.js`：DeepSeek 官方价目表（Flash / Pro，空闲与高峰两档）、峰谷时段规则、
  2026 年法定节假日清单，以及逐条记录的金额换算（金额以 1e-8 元为最小单位整数累计）。
- 峰谷档位按每条日志记录自身的时间戳判定，而不是按请求时刻；周末与法定节假日全天按空闲价。
- 宿主聚合新增 `currency`、`totalCost`、`pricing` 与逐日 `cost` 字段；模型维度同时返回金额与
  `assumed` 标记（未列入价目表的模型回退到 Flash 价并在界面列出）。
- 详情页与脚注明确标注「金额为估算，实际以账单为准」。
- 测试：`test-host` 增加峰谷档位、周末、法定节假日、模型价目与回退价的断言；`test-client`
  增加金额展示与无数据日 `¥0.00` 的断言。

Adds an estimated daily cost in CNY to the detail panel. A new `lib/pricing.js` carries DeepSeek's
published Flash/Pro prices for the off-peak and peak tiers, the Beijing-time peak schedule, the 2026
statutory-holiday list, and per-record cost calculation with integer money units. Peak tier selection
uses each log record's own timestamp; weekends and holidays always use off-peak prices. The host
payload gains `currency`, `totalCost`, `pricing` metadata and a per-day `cost`; model entries gain
`cost` and an `assumed` flag. The UI and footnote state that the figure is an estimate, not a bill.

## 0.4.3 — 2026-10-15

- 文档：两份 README 的「界面示例」章节新增**截图时效说明**，指明现有截图拍摄于 v0.4.1 之前，并逐条列出 v0.4.1 引入、
  因而在图中无法体现的两处界面变更（空态格子更暗、收起详情后保留选中状态）。
- 本次不重新拍摄截图；正文描述均为当前行为。
- 无代码变更。

Documentation only: the "Screenshots" section of both README files now records that the images predate
v0.4.1 and lists the two UI changes introduced in that version which the images therefore cannot show
(darker empty-day cells; collapsing a day retains its selection). No screenshots are re-captured.

## 0.4.2 — 2026-10-15

- 文档：README 中英文版新增「设计要点」章节，以设计决策的形式说明与同类实现的差异。
- 文档：全面修订中英文措辞，去除口语化表达，统一术语与句式为书面技术文档风格。
- 无代码变更。

Documentation only: both README files gain a "Design highlights" section written as design decisions,
and all bilingual prose is revised into a formal technical-documentation register.

## 0.4.1 — 2026-10-15

- 修复空态色阶：空记录的底色原先引用 `--dsw-alias-bg-sunken`，该变量在 DSH 主题中并不存在，
  实际落到兜底值 `rgba(127,127,127,.16)`，其亮度介于 level 1（26%）与 level 2（48%）之间，
  使"无用量记录"呈现为中等用量。现空态固定为最暗一档（8%），亮度范围全部让给有记录的格子。
- 选中与展开拆分为独立状态：再次选择已选日期仅收起详情正文并保留选中外圈，当前选中日期始终可辨；
  收起行内新增展开控件；`Esc` 在格子上第一次收起详情、第二次取消选中。
- 热力图下方新增一行提示「点击格子查看当日详情」，选中日期后自动消失。
- 说明文字对比度由 `label-tertiary` 提升至 `label-secondary`，并精简统计口径文案。
- 客户端回归测试补充收起/展开、日期直接切换、`Esc` 两段行为与提示显隐的断言。

Empty-day cells previously referenced a theme variable that does not exist in DSH, so they fell back
to a gray whose lightness sits between levels 1 and 2 and read as mid usage. Empty cells are now
pinned to the dimmest step, collapsing a day retains its selection outline, a dedicated control
re-expands it, and `Esc` collapses before it clears. A discovery hint and higher-contrast notes
complete the change.

## Unreleased

- Standardize source and documentation formatting with EditorConfig and Prettier.
- Remove obsolete injection documentation, unused client metadata and superseded screenshots.
- Clarify metric definitions and replace unsupported performance claims.
- Make client fixtures independent of the current date and update calendar tests.
- Include the aggregation time zone in cache invalidation and verify it with synthetic logs.
- Verify route disposal and compare complete daily/model cache results.

## 0.4.0 — 2026-10-15

- 默认近半年；全年分上下两排，放大日期格并按容器适配，避免横向滚动条。
- 新增灰阶斜向入场、悬停/焦点反馈、精简 Token 提示及减少动态效果适配。
- 点击日期显示底部页内详情，保留热力图和筛选；新增 Token 构成条。
- 修复首次入场先完整显示再铺开的闪现，以及周日和夏令时的日期窗口问题。
- 新增客户端逻辑回归测试，整理中英文使用说明。

The default range is now six months; the year is split into two rows. This update adds grayscale motion and focus feedback, compact tooltips, inline daily details and a Token composition bar. It also fixes entrance flashing and calendar-window edge cases, and adds client regression checks and updated bilingual documentation.
