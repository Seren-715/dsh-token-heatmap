# Changelog

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
