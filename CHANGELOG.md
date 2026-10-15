# Changelog

## 0.4.1 — 2026-10-15

- 修复空态色阶：空记录原本用 `--dsw-alias-bg-sunken`，而该变量在 DSH 主题里并不存在，
  一直落到兜底值 `rgba(127,127,127,.16)`，恰好夹在 level 1（26%）与 level 2（48%）之间，
  让"没有用量"看起来像中等用量。现在空态固定为 8% 的最暗一档，有记录的格子独占亮度范围。
- 选中与展开分离：再次点击已选日期只收起正文，选中外圈保留，"刚看的是哪天"不会丢；
  新增收起行的展开控件，`Esc` 在格子上第一次收起、第二次取消选中。
- 热力图下方新增一行轻提示「点击格子查看当日详情」，选中日期后自动消失。
- 说明文字对比度从 `label-tertiary` 提到 `label-secondary`，并精简统计口径文案。
- 客户端回归测试补上收起/展开、日期直接切换、`Esc` 两段行为与提示显隐的断言。

Empty-day cells previously used a theme variable that does not exist in DSH, so they fell back to a
gray that sat between levels 1 and 2 and read as mid usage. Empty cells are now pinned to the
dimmest step, collapsing a day keeps its selection outline, a dedicated control re-expands it, and
`Esc` collapses before it clears. A discovery hint and higher-contrast notes round out the change.

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
