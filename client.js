/**
 * dsh-token-heatmap —— 浏览器端（设置页组件）
 *
 * 注册进 `settings.section`，作为设置里的一节：热力图，每格一天，颜色越深当天
 * 消耗的 token 越多。数据从宿主侧的 `/dsh-token-heatmap/data` 取（同源）。
 *
 * 规范约束（DSH 插件开发文档）：
 *   * 通过 slot 注册 React 组件，不向 `document.body` 追加浮层、不替换应用根节点；
 *   * 不 import 任何 Harness Client 包，React 从浏览器模块表里取；样式自己写，
 *     优先使用 `--dsw-alias-*` 主题变量，深浅色随之自动跟随；
 *   * 可见文案通过 Client locale 服务提供，以响应宿主语言切换；
 *   * 样式与请求都挂在组件生命周期里，卸载即清理。
 */

window.__ModuleLoader__.load({
  id: 'dsh-token-heatmap',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const LOCALE_NS = 'settings.token-heatmap';
    const DATA_URLS = ['/dsh-token-heatmap/data', 'dsh-token-heatmap/data'];
    const YEAR_WEEKS = 53;
    const HALF_YEAR_WEEKS = 26;
    /** 两个内置语言必须齐全（locale 服务的要求），键一一对应。 */
    const DICTIONARIES = {
      zh: {
        navLabel: 'Token 用量',
        detailTitle: '当日 Token 使用详情',
        detailTotal: '当日总量',
        includesCache: 'Token · 含缓存读取',
        composition: '用量构成 · 按 Token 数量',
        other: '其他',
        tipCacheWrite: '缓存写入',
        openDay: '查看 {day} 当天详情',
        tipClick: '点击查看详情',
        tipWeekAmount: '本周',
        metricTotal: '总量',
        metricIo: '输入+输出',
        metricCacheRead: '缓存读',
        metricOutput: '输出',
        modeDay: '每天',
        modeWeek: '每周',
        summaryToday: '今日',
        summaryWeek: '本周',
        summaryTotal: '合计',
        loading: '统计中…',
        loadFailed: '加载失败：{message}',
        rangeHalf: '近半年',
        rangeYear: '近一年',
        rangeLabel: '时间范围',
        rangeHintDay: '一格一天（一列 7 天）',
        rangeHintWeek: '一格一周（整列同色）',
        noRecord: '无用量记录',
        tipInput: '输入',
        tipOutput: '输出',
        tipCacheRead: '缓存读',
        tipCalls: '调用',
        legendLess: '少',
        legendMore: '多',
        selectDate: '点击格子查看当日详情',
        collapseDetail: '收起详情',
        expandDetail: '展开详情',
        costLabel: '当日消费',
        costNote: '按 DeepSeek 官方价目估算（含峰谷分时），实际以账单为准。',
        costAssumed: '以下模型按默认价目估算：{models}',
        footnote: '数据来自本地 DSH 会话日志；总量含缓存读取。金额按官方价目估算，实际以账单为准。'
      },
      en: {
        navLabel: 'Token usage',
        detailTitle: 'Daily token usage',
        detailTotal: 'Daily total',
        includesCache: 'Token · includes cache reads',
        composition: 'Usage composition · by token count',
        other: 'Other',
        tipCacheWrite: 'Cache write',
        openDay: 'View details for {day}',
        tipClick: 'Click to view details',
        tipWeekAmount: 'This week',
        metricTotal: 'Total',
        metricIo: 'Input+output',
        metricCacheRead: 'Cache read',
        metricOutput: 'Output',
        modeDay: 'Daily',
        modeWeek: 'Weekly',
        summaryToday: 'Today',
        summaryWeek: 'This week',
        summaryTotal: 'All time',
        loading: 'Loading…',
        loadFailed: 'Failed to load: {message}',
        rangeHalf: 'Last 6 months',
        rangeYear: 'Last year',
        rangeLabel: 'Time range',
        rangeHintDay: 'One cell per day (7 rows)',
        rangeHintWeek: 'One cell per week (whole column)',
        noRecord: 'No usage recorded',
        tipInput: 'Input',
        tipOutput: 'Output',
        tipCacheRead: 'Cache read',
        tipCalls: 'Calls',
        legendLess: 'Less',
        legendMore: 'More',
        selectDate: 'Select a date to view details',
        collapseDetail: 'Hide details',
        expandDetail: 'Show details',
        costLabel: 'Daily cost',
        costNote: 'Estimated from DeepSeek list prices (peak/off-peak); actual billing may differ.',
        costAssumed: 'Default pricing applied to: {models}',
        footnote:
          'From local DSH session logs; totals include cache reads. Costs are estimates from DeepSeek list prices; actual billing may differ.'
      }
    };

    const METRICS = ['totalTokens', 'io', 'cacheReadTokens', 'outputTokens'];
    const METRIC_KEYS = {
      totalTokens: 'metricTotal',
      io: 'metricIo',
      cacheReadTokens: 'metricCacheRead',
      outputTokens: 'metricOutput'
    };
    const MODES = [
      { key: 'day', labelKey: 'modeDay' },
      { key: 'week', labelKey: 'modeWeek' }
    ];

    const STYLES = `
.dth-root { display: flex; flex-direction: column; gap: 14px; width: 100%; }
/* 口径在左、模式在右，中间留白分开两组；摘要在下面单独一行。 */
.dth-head { display: flex; align-items: baseline; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
/* 纯文字切换：没有边框、没有底色、没有内边距盒子；选中只换颜色与字重。 */
.dth-seg { display: flex; align-items: baseline; gap: 14px; }
.dth-seg[data-align='end'] { margin-left: auto; }
.dth-seg button {
  padding: 0; border: 0; background: none; font: inherit; cursor: pointer;
  color: var(--dsw-alias-label-secondary, #61666b);
}
.dth-seg button:hover { color: var(--dsw-alias-label-primary, #0f1115); }
.dth-seg button[data-active='true'] {
  color: var(--dsw-alias-label-primary, #0f1115);
  font-weight: 500;
}
.dth-summary { color: var(--dsw-alias-label-secondary, #61666b); }
.dth-summary b { color: var(--dsw-alias-label-primary, inherit); font-weight: 500; }
.dth-line { display: flex; align-items: baseline; }
.dth-scroll { display: flex; flex-direction: column; gap: 18px; overflow-x: auto; overflow-y: hidden; padding: 2px 2px 8px; min-width: 0; }
/* 用 flex 列而不是 grid-auto-flow: column —— grid 在 overflow 容器里没有固有宽度，
   会被压缩；flex 列的固有宽度是确定的。 */
.dth-weeks { display: flex; gap: 4px; width: max-content; }
.dth-week { display: flex; flex-direction: column; gap: 4px; }
/* Fit the range without horizontal scrolling; cap cells at 20px. */
/* 无记录 = 最暗的一档；有记录的格子独占亮度范围（8% 垫底、26→100% 递增）。
   不要用 --dsw-alias-bg-sunken：这个变量在 DSH 主题里不存在，只会落到兜底值，
   而兜底值恰好夹在 level 1 和 level 2 之间，会让空态看起来像"中等用量"。 */
.dth-cell { width: var(--dth-cell, 20px); height: var(--dth-cell, 20px); border-radius: 3px; background: color-mix(in srgb, var(--dsw-alias-label-primary, #555) 8%, transparent); }
.dth-cell[data-level='1'] { background: color-mix(in srgb, var(--dsw-alias-label-primary, #555) 26%, transparent); }
.dth-cell[data-level='2'] { background: color-mix(in srgb, var(--dsw-alias-label-primary, #555) 48%, transparent); }
.dth-cell[data-level='3'] { background: color-mix(in srgb, var(--dsw-alias-label-primary, #555) 72%, transparent); }
.dth-cell[data-level='4'] { background: var(--dsw-alias-label-primary, #555); }
.dth-legend { display: flex; align-items: center; gap: 4px; }
.dth-legend i.dth-cell { display: block; width: 10px; height: 10px; }
/* 月份刻度与上面每一列一一对应：同宽同序，标签不参与排版偏移。 */
.dth-months { display: flex; gap: 4px; margin-top: 5px; width: max-content; color: var(--dsw-alias-label-tertiary, #81858c); font-size: 11px; }
.dth-month { width: var(--dth-cell, 20px); height: 14px; flex: none; position: relative; }
.dth-month span { position: absolute; left: 0; top: 0; white-space: nowrap; }
.dth-foot { flex-wrap: wrap; display: flex; align-items: center; gap: 10px; color: var(--dsw-alias-label-secondary, #61666b); font-size: 12px; }
/* 说明文字用 label-secondary：原来的 tertiary 在深色底上对比度偏低。 */
.dth-note { color: var(--dsw-alias-label-secondary, #61666b); font-size: 12px; line-height: 20px; margin: 0; }
.dth-error { color: #d9534f; }
.dth-tip {
  position: fixed; z-index: 2147483001; padding: 7px 10px; border-radius: 8px;
  background: rgba(24,26,30,.95); color: #f4f6f8; font-size: 12px; line-height: 18px;
  pointer-events: none; opacity: 0; transition: opacity 120ms ease-out; white-space: pre;
}
.dth-tip[data-show='true'] { opacity: 1; }
.dth-root { font-variant-numeric: tabular-nums; }
.dth-overview { display: flex; flex-direction: column; gap: 14px; }
button.dth-cell { padding: 0; border: 0; cursor: pointer; flex: none; position: relative; transition: opacity 150ms ease-out, transform 120ms ease-out, background-color 150ms ease-out; }
.dth-weeks[data-ready='false'] { visibility: hidden; }
.dth-weeks[data-enter='true'] button.dth-cell { animation: dth-reveal 180ms ease-out both; animation-delay: var(--dth-delay); }
@keyframes dth-reveal { from { opacity: 0; transform: scale(.88); } to { opacity: 1; transform: scale(1); } }
.dth-weeks[data-engaged='true'] button.dth-cell { opacity: .8; transition-duration: 120ms; }
.dth-weeks button.dth-cell[data-highlight='true'] { opacity: 1; transform: scale(1.06); outline: 1px solid var(--dsw-alias-label-primary, #555); outline-offset: 1px; z-index: 1; }
.dth-weeks button.dth-cell:active { transform: scale(.94); }
.dth-root button:focus-visible { outline: 2px solid var(--dsw-alias-label-primary, #555); outline-offset: 2px; }
.dth-weeks button.dth-cell[data-selected='true'] { outline: 1px solid var(--dsw-alias-label-primary, #555); outline-offset: 1px; }
.dth-detail { padding-top: 16px; display: flex; flex-direction: column; gap: 20px; }
/* 收起后只留一行：日期 + 展开控件；选中边框仍留在热力图上，
   这样"正在看哪一天"不会因为收起而丢失。 */
.dth-detail-head { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 14px; }
.dth-detail-toggle {
  border: 0; background: none; padding: 0; margin: 0; cursor: pointer;
  font: inherit; font-size: 12px; line-height: 20px;
  color: var(--dsw-alias-label-secondary, #61666b);
}
.dth-detail-toggle:hover { color: var(--dsw-alias-label-primary, #555); }
.dth-detail-toggle:focus-visible { outline: 2px solid var(--dsw-alias-label-primary, #555); outline-offset: 2px; }
.dth-detail h3, .dth-detail p { margin: 0; }
.dth-detail h3 { font-size: 18px; font-weight: 500; }
/* 当日总量与估算消费并排；窄容器自动换行。 */
.dth-detail-totals { display: flex; flex-wrap: wrap; gap: 16px 48px; }
.dth-detail-totals > div { min-width: 0; }
.dth-total { font-size: 32px; font-weight: 500; color: var(--dsw-alias-label-primary, #555); }
.dth-stats { display: flex; flex-wrap: wrap; gap: 20px 36px; margin: 0; }
.dth-stats dt { color: var(--dsw-alias-label-secondary, #61666b); margin-bottom: 6px; }
.dth-stats dd { margin: 0; font-size: 20px; }
.dth-composition { display: flex; flex-wrap: wrap; gap: 10px 20px; margin-top: 10px; font-size: 12px; color: var(--dsw-alias-label-secondary, #61666b); }
.dth-bar { display: flex; height: 12px; width: 100%; overflow: hidden; border-radius: 4px; background: color-mix(in srgb, var(--dsw-alias-label-primary, #555) 8%, transparent); margin-top: 10px; }
.dth-bar-segment { height: 100%; flex: none; }
.dth-swatch { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; }
.dth-part[data-part='inputTokens'] { background: color-mix(in srgb, var(--dsw-alias-label-primary, #555) 90%, transparent); }
.dth-part[data-part='outputTokens'] { background: color-mix(in srgb, var(--dsw-alias-label-primary, #555) 65%, transparent); }
.dth-part[data-part='cacheReadTokens'] { background: color-mix(in srgb, var(--dsw-alias-label-primary, #555) 35%, transparent); }
.dth-part[data-part='cacheWriteTokens'] { background: color-mix(in srgb, var(--dsw-alias-label-primary, #555) 50%, transparent); }
.dth-part[data-part='other'] { background: color-mix(in srgb, var(--dsw-alias-label-primary, #555) 20%, transparent); }
@media (prefers-reduced-motion: reduce) {
  .dth-root button.dth-cell, .dth-tip { animation: none !important; transition: none !important; }
  .dth-weeks button.dth-cell[data-highlight='true'], .dth-weeks button.dth-cell:active { transform: none; }
}

`;

    const valueOf = (day, metric) => {
      if (day === undefined || day === null) return 0;
      if (metric === 'io') return (day.inputTokens || 0) + (day.outputTokens || 0);
      return day[metric] || 0;
    };

    // Format compact values using the active language units.
    const formatTokens = (value, language) => {
      if (!Number.isFinite(value) || value <= 0) return '0';
      if (language === 'zh') {
        if (value >= 1e8) return `${(value / 1e8).toFixed(2)} 亿`;
        if (value >= 1e4) return `${(value / 1e4).toFixed(1)} 万`;
        return String(Math.round(value));
      }
      if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
      if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
      if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
      return String(Math.round(value));
    };

    const formatFull = (value) => (Number.isFinite(value) ? value.toLocaleString('en-US') : '0');

    // 金额由宿主按官方价目表估算，币种随载荷下发；小额保留可读性。
    const formatCost = (value) => {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0) return '¥0.00';
      if (amount < 0.01) return '<¥0.01';
      return `¥${amount.toFixed(2)}`;
    };

    // 月份刻度：中文用 "10月"，英文用 "Oct"。
    const MONTHS_EN = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    const monthLabel = (monthIndex, language) =>
      language === 'zh' ? `${monthIndex + 1}月` : MONTHS_EN[monthIndex];

    // 本地日历日；不用 toISOString，避免时区把日期推错一天。
    const dayKey = (date) => {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${date.getFullYear()}-${month}-${day}`;
    };

    // Quantile thresholds encode relative usage for the selected metric.
    const buildCuts = (values) => {
      const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
      if (sorted.length === 0) return [0, 0, 0];
      const at = (fraction) =>
        sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
      return [at(0.25), at(0.5), at(0.75)];
    };

    const levelOf = (value, cuts) => {
      if (value <= 0) return 0;
      if (value <= cuts[0]) return 1;
      if (value <= cuts[1]) return 2;
      if (value <= cuts[2]) return 3;
      return 4;
    };

    const fetchData = async () => {
      let lastError = null;
      for (const url of DATA_URLS) {
        try {
          const response = await fetch(url, {
            headers: { accept: 'application/json' },
            credentials: 'same-origin'
          });
          if (!response.ok) {
            lastError = new Error(`HTTP ${response.status}`);
            continue;
          }
          return await response.json();
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error('unavailable');
    };

    /** Resolve the injected translation function before using the namespace binding. */
    const makeTranslate = (props, bound) => {
      if (typeof props?.t === 'function') return props.t;
      if (typeof bound === 'function') return bound;
      return (key) => key;
    };

    function TokenHeatmap(props) {
      const [payload, setPayload] = React.useState(null);
      const [failure, setFailure] = React.useState(null);
      const [metric, setMetric] = React.useState('totalTokens');
      const [mode, setMode] = React.useState('day');
      const [cell, setCell] = React.useState(20);
      // detailOpen 放在后面：state 顺序影响 tools/test-client.mjs 的下标断言。
      const [detailOpen, setDetailOpen] = React.useState(false);
      const [tip, setTip] = React.useState(null);
      const [selectedDay, setSelectedDay] = React.useState(null);
      const [highlight, setHighlight] = React.useState(null);
      // Arm before the first data render so visible cells never paint before the reveal.
      const [entering, setEntering] = React.useState(true);
      const enteredRef = React.useRef(false);
      const [language, setLanguage] = React.useState(() => props?.language ?? 'en');
      const [range, setRange] = React.useState('half');
      const weeks = range === 'half' ? HALF_YEAR_WEEKS : YEAR_WEEKS;
      const columnsPerRow = range === 'half' ? HALF_YEAR_WEEKS : Math.ceil(YEAR_WEEKS / 2);
      const frameRef = React.useRef(null);
      const t = makeTranslate(props, props?.tBound);

      // CSS owns the stagger; one cancellable timer only marks its completion.
      React.useEffect(() => {
        if (payload === null || enteredRef.current) return;
        enteredRef.current = true;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
          setEntering(false);
          return;
        }
        const timer = window.setTimeout(() => setEntering(false), 600);
        return () => window.clearTimeout(timer);
      }, [payload !== null]);

      // 选中与展开是同一台状态机：点另一天直接换日期并展开；点当前这天在
      // 展开/收起之间切换。收起只隐藏正文，选中边框留在热力图上，
      // 所以"刚才看的是哪天"不会因为收起而丢失。
      const openDay = (key) => {
        setTip(null);
        setHighlight(null);
        setEntering(false);
        if (selectedDay === key) {
          setDetailOpen((previous) => !previous);
          return;
        }
        setSelectedDay(key);
        // 已选中某天时，收起状态下点新的一天应当直接换日期并展开。
        setDetailOpen(true);
      };

      // 语言变化时重渲染：locale 快照每次变化都会通知（切语言或补注册字典）。
      React.useEffect(() => {
        const locale = props?.locale;
        if (locale === undefined || typeof locale.subscribe !== 'function') return;
        const read = () => {
          const snapshot =
            typeof locale.getSnapshot === 'function' ? locale.getSnapshot() : undefined;
          const active = snapshot?.active;
          if (typeof active === 'string' && active !== '') setLanguage(active);
        };
        read();
        return locale.subscribe(read);
      }, [props?.locale]);

      // 样式随组件挂载注入、卸载移除，不给页面留残留。
      React.useEffect(() => {
        const element = document.createElement('style');
        element.textContent = STYLES;
        document.head.appendChild(element);
        return () => {
          element.remove();
        };
      }, []);

      // Request data on mount, every minute, and when the page becomes visible or focused.
      // File-level caching on the host reduces repeated parsing.
      React.useEffect(() => {
        let alive = true;
        let inFlight = false;
        const load = async () => {
          if (!alive || inFlight) return;
          inFlight = true;
          try {
            const value = await fetchData();
            if (alive) {
              setPayload(value);
              setFailure(null);
            }
          } catch (error) {
            // Preserve existing data when a refresh fails.
            if (alive)
              setFailure((previous) =>
                previous === null
                  ? error instanceof Error
                    ? error.message
                    : String(error)
                  : previous
              );
          } finally {
            inFlight = false;
          }
        };
        void load();
        const timer = window.setInterval(() => void load(), 60000);
        const onVisible = () => {
          if (document.visibilityState === 'visible') void load();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        return () => {
          alive = false;
          window.clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisible);
          window.removeEventListener('focus', onVisible);
        };
      }, []);

      // Fit the complete range inside the container, including scroll-frame padding.
      React.useLayoutEffect(() => {
        const element = frameRef.current;
        if (element === null) return;
        const compute = () => {
          const available = element.clientWidth;
          const width = Math.floor((available - 4 - (columnsPerRow - 1) * 4) / columnsPerRow);
          setCell(Math.max(1, Math.min(20, width)));
        };
        compute();
        if (typeof ResizeObserver !== 'function') return;
        const observer = new ResizeObserver(compute);
        observer.observe(element);
        return () => observer.disconnect();
      }, [columnsPerRow]);

      // "今天"每帧重算：跨过零点后，下一次渲染就会把描边挪到新的一天。
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayKey = dayKey(today);

      const days = payload?.days ?? [];
      const byDay = new Map(days.map((day) => [day.day, day]));

      // 从当前周周日向前回溯所选周数，保持自然周对齐，
      // 末尾多出来的几天（今天之后）留空。
      const start = new Date(today);
      start.setDate(start.getDate() - start.getDay() - (weeks - 1) * 7);
      // 保留原日期对象，避免日期加减被隐式字符串化。
      const at = (offset) => {
        const date = new Date(start);
        date.setDate(date.getDate() + offset);
        return date;
      };

      // 每周口径：把自然周（周日→周六）内的每一天加起来。当天之后的格子不计入。
      const weekTotals = [];
      for (let offset = 0; offset < weeks * 7; offset += 1) {
        const date = at(offset);
        if (date.getTime() > today.getTime()) continue;
        const bucket = (weekTotals[Math.floor(offset / 7)] ??= {
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          calls: 0
        });
        const record = byDay.get(dayKey(date));
        if (record !== undefined) {
          bucket.totalTokens += record.totalTokens || 0;
          bucket.inputTokens += record.inputTokens || 0;
          bucket.outputTokens += record.outputTokens || 0;
          bucket.cacheReadTokens += record.cacheReadTokens || 0;
          bucket.cacheWriteTokens += record.cacheWriteTokens || 0;
          bucket.calls += record.calls || 0;
        }
      }

      const dayValues = days.map((day) => valueOf(day, metric));
      const weekValues = weekTotals.map((week) => (week === undefined ? 0 : valueOf(week, metric)));

      /** 把 7 天一组的数据铺成"每列一周"的格子，供两种口径共用。 */
      const buildColumns = (cellsFor) => {
        const columns = [];
        const monthLabels = [];
        for (let week = 0; week < weeks; week += 1) {
          const columnCells = [];
          let label = '';
          for (let weekday = 0; weekday < 7; weekday += 1) {
            const date = at(week * 7 + weekday);
            if (
              label === '' &&
              (date.getDate() === 1 || (week % columnsPerRow === 0 && weekday === 0))
            )
              label = monthLabel(date.getMonth(), language);
            if (date.getTime() > today.getTime()) {
              columnCells.push(
                h('div', {
                  key: `x${week}-${weekday}`,
                  className: 'dth-cell',
                  style: { visibility: 'hidden' }
                })
              );
              continue;
            }
            columnCells.push(cellsFor({ week, weekday, date, key: dayKey(date) }));
          }
          columns.push(h('div', { key: `w${week}`, className: 'dth-week' }, columnCells));
          monthLabels.push(label);
        }
        // Reserve enough horizontal space for each localized month label.
        // Prefer a month boundary over an adjacent partial-month row heading.
        const minimumLabelColumns = Math.ceil(48 / (cell + 4));
        for (let rowStart = 0; rowStart < weeks; rowStart += columnsPerRow) {
          let previous = -1;
          for (let week = rowStart; week < Math.min(weeks, rowStart + columnsPerRow); week += 1) {
            if (!monthLabels[week]) continue;
            if (previous >= rowStart && week - previous < minimumLabelColumns) {
              if (previous === rowStart) monthLabels[previous] = '';
              else {
                monthLabels[week] = '';
                continue;
              }
            }
            previous = week;
          }
        }
        const labels = monthLabels.map((label, week) =>
          h(
            'div',
            { key: `m${week}`, className: 'dth-month' },
            label === '' ? null : h('span', null, label)
          )
        );
        return { columns, labels };
      };

      const hoverHandlers = (text, key, week, weekday) => ({
        type: 'button',
        'aria-label': `${text}. ${t('openDay', { day: key })}`,
        'data-day': key,
        'data-highlight': String(highlight === key),
        'data-selected': String(selectedDay === key),
        'aria-pressed': selectedDay === key,
        'aria-controls': 'dth-day-detail',
        style: { '--dth-delay': `${Math.round(((week + weekday) / (weeks + 5)) * 420)}ms` },
        onMouseEnter: (event) => {
          setHighlight(key);
          setTip({ text: `${key}\n${text}`, x: event.clientX, y: event.clientY });
        },
        onMouseLeave: () => {
          setHighlight(null);
          setTip(null);
        },
        onFocus: (event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setHighlight(key);
          setTip({ text: `${key}\n${text}`, x: rect.left, y: rect.top });
        },
        onBlur: () => {
          setHighlight(null);
          setTip(null);
        },
        onKeyDown: (event) => {
          if (event.key !== 'Escape') return;
          setTip(null);
          setHighlight(null);
          // 焦点还在格子上时按 Esc 也能收起详情：第一次收起、第二次取消选中。
          if (detailOpen) setDetailOpen(false);
          else setSelectedDay(null);
        },
        onClick: () => openDay(key)
      });

      // 每天视图：一格一天，四档分位色阶。
      const dayCuts = buildCuts(dayValues);
      const dayView = buildColumns(({ week, weekday, key }) => {
        const record = byDay.get(key);
        return h('button', {
          key,
          className: 'dth-cell',
          'data-level': String(levelOf(valueOf(record, metric), dayCuts)),
          ...hoverHandlers(
            `${t(METRIC_KEYS[metric])} ${formatFull(valueOf(record, metric))} Token\n${t('tipClick')}`,
            key,
            week,
            weekday
          )
        });
      });

      // 每周视图：整列 7 格同色、同 tooltip；格子与每天视图同尺寸，形状一致。
      const weekCuts = buildCuts(weekValues.filter((value) => value > 0));
      const weekView = buildColumns(({ week, weekday, date, key }) => {
        const bucket = weekTotals[week];
        const value = bucket === undefined ? 0 : valueOf(bucket, metric);
        const text = `${t('tipWeekAmount')} · ${t(METRIC_KEYS[metric])} ${formatFull(value)} Token\n${t('tipClick')}`;
        return h('button', {
          key: `k${week}-${date.getDay()}`,
          className: 'dth-cell',
          'data-level': String(levelOf(value, weekCuts)),
          ...hoverHandlers(text, key, week, weekday)
        });
      });

      const activeView = mode === 'day' ? dayView : weekView;
      const heatmapRows = [];
      for (let offset = 0; offset < weeks; offset += columnsPerRow) {
        heatmapRows.push(
          h(
            'div',
            { key: `row-${offset}`, className: 'dth-heatmap-row' },
            h(
              'div',
              {
                className: 'dth-weeks',
                'data-ready': String(payload !== null),
                'data-enter': String(payload !== null && entering),
                'data-engaged': String(highlight !== null)
              },
              activeView.columns.slice(offset, offset + columnsPerRow)
            ),
            h(
              'div',
              { className: 'dth-months' },
              activeView.labels.slice(offset, offset + columnsPerRow)
            )
          )
        );
      }

      const currentWeek = weekTotals[weeks - 1];
      const summary =
        failure !== null
          ? h('span', { className: 'dth-error' }, t('loadFailed', { message: failure }))
          : payload === null
            ? t('loading')
            : h(
                React.Fragment,
                null,
                `${t('summaryToday')} `,
                h('b', null, formatTokens(valueOf(byDay.get(todayKey), metric), language)),
                ` · ${t('summaryWeek')} `,
                h(
                  'b',
                  null,
                  formatTokens(
                    currentWeek === undefined ? 0 : valueOf(currentWeek, metric),
                    language
                  )
                ),
                ` · ${t('summaryTotal')} `,
                h('b', null, formatTokens(payload.totalTokens ?? 0, language))
              );

      const renderDetail = (open) => {
        const record = byDay.get(selectedDay) ?? {};
        const total = record.totalTokens || 0;
        // 金额由宿主按官方价目表估算；旧版宿主没有该字段时按 0 展示。
        const cost = Number(record.cost) || 0;
        const assumedModels = Array.isArray(payload?.pricing?.assumedModels)
          ? payload.pricing.assumedModels
          : [];
        const parts = [
          ['tipInput', 'inputTokens'],
          ['tipOutput', 'outputTokens'],
          ['tipCacheRead', 'cacheReadTokens'],
          ['tipCacheWrite', 'cacheWriteTokens']
        ].map(([label, field]) => ({
          label: t(label),
          field,
          value: Math.max(0, record[field] || 0)
        }));
        const componentTotal = parts.reduce((sum, part) => sum + part.value, 0);
        if (total > componentTotal)
          parts.push({ label: t('other'), field: 'other', value: total - componentTotal });
        const compositionTotal = Math.max(total, componentTotal);
        const visibleParts = parts.filter((part) => part.value > 0);
        const percentOf = (part) => (part.value / compositionTotal) * 100;
        const partLabel = (part) => `${part.label} ${percentOf(part).toFixed(2)}%`;
        const date = new Date(`${selectedDay}T12:00:00`);
        const title = date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const head = h(
          'div',
          { className: 'dth-detail-head' },
          h('h3', null, title),
          h(
            'button',
            {
              type: 'button',
              className: 'dth-detail-toggle',
              'aria-expanded': String(open),
              'aria-controls': 'dth-day-detail',
              onClick: () => setDetailOpen((previous) => !previous)
            },
            open ? t('collapseDetail') : t('expandDetail')
          )
        );
        // 收起时只保留"哪天 + 展开控件"；选中边框留在热力图上，状态不丢。
        if (!open) {
          return h(
            'section',
            {
              id: 'dth-day-detail',
              className: 'dth-detail',
              'aria-label': t('detailTitle')
            },
            head
          );
        }
        return h(
          'section',
          {
            id: 'dth-day-detail',
            className: 'dth-detail',
            'aria-label': t('detailTitle'),
            'aria-live': 'polite',
            'aria-atomic': 'true'
          },
          h('div', null, head, h('p', { className: 'dth-note' }, t('detailTitle'))),
          h(
            'div',
            { className: 'dth-detail-totals' },
            h(
              'div',
              null,
              h('p', { className: 'dth-note' }, t('detailTotal')),
              h('div', { className: 'dth-total' }, formatTokens(total, language)),
              h('p', { className: 'dth-note' }, `${formatFull(total)} ${t('includesCache')}`)
            ),
            h(
              'div',
              null,
              h('p', { className: 'dth-note' }, t('costLabel')),
              h('div', { className: 'dth-total' }, formatCost(cost)),
              h('p', { className: 'dth-note' }, t('costNote')),
              assumedModels.length === 0
                ? null
                : h(
                    'p',
                    { className: 'dth-note' },
                    t('costAssumed', { models: assumedModels.join(', ') })
                  )
            )
          ),
          byDay.has(selectedDay) ? null : h('p', { className: 'dth-note' }, t('noRecord')),
          h(
            'dl',
            { className: 'dth-stats' },
            [
              ['tipInput', 'inputTokens'],
              ['tipOutput', 'outputTokens'],
              ['tipCacheRead', 'cacheReadTokens'],
              ...(record.cacheWriteTokens > 0 ? [['tipCacheWrite', 'cacheWriteTokens']] : []),
              ['tipCalls', 'calls']
            ].map(([label, field]) =>
              h(
                'div',
                { key: field },
                h('dt', null, t(label)),
                h('dd', null, formatFull(record[field] || 0))
              )
            )
          ),
          h(
            'div',
            null,
            h('p', { className: 'dth-note' }, t('composition')),
            h(
              'div',
              {
                className: 'dth-bar',
                role: 'img',
                'aria-label':
                  compositionTotal > 0 ? visibleParts.map(partLabel).join(', ') : t('noRecord')
              },
              visibleParts.map((part) =>
                h('span', {
                  key: part.field,
                  className: 'dth-bar-segment dth-part',
                  'data-part': part.field,
                  'aria-hidden': 'true',
                  style: { width: `${percentOf(part)}%` }
                })
              )
            ),
            compositionTotal <= 0
              ? h('p', { className: 'dth-note' }, t('noRecord'))
              : h(
                  'div',
                  { className: 'dth-composition' },
                  visibleParts.map((part) =>
                    h(
                      'span',
                      { key: part.field },
                      h('i', {
                        className: 'dth-swatch dth-part',
                        'data-part': part.field,
                        'aria-hidden': 'true'
                      }),
                      partLabel(part)
                    )
                  )
                )
          )
        );
      };

      return h(
        'div',
        { className: 'dth-root', ref: frameRef, style: { '--dth-cell': `${cell}px` } },
        h(
          'div',
          { className: 'dth-overview' },
          h(
            'div',
            { className: 'dth-head' },
            h(
              'div',
              { className: 'dth-seg' },
              METRICS.map((key) =>
                h(
                  'button',
                  {
                    key,
                    type: 'button',
                    'data-active': String(key === metric),
                    'aria-pressed': key === metric,
                    onClick: () => setMetric(key)
                  },
                  t(METRIC_KEYS[key])
                )
              )
            ),
            h(
              'div',
              { className: 'dth-seg', 'data-align': 'end' },
              MODES.map((entry) =>
                h(
                  'button',
                  {
                    key: entry.key,
                    type: 'button',
                    'data-active': String(entry.key === mode),
                    'aria-pressed': entry.key === mode,
                    onClick: () => setMode(entry.key)
                  },
                  t(entry.labelKey)
                )
              )
            )
          ),
          h('div', { className: 'dth-line' }, h('span', { className: 'dth-summary' }, summary)),
          h('div', { className: 'dth-scroll' }, heatmapRows),
          h(
            'div',
            { className: 'dth-foot' },
            h(
              'div',
              { className: 'dth-seg', role: 'group', 'aria-label': t('rangeLabel') },
              ['half', 'year'].map((key) =>
                h(
                  'button',
                  {
                    key,
                    type: 'button',
                    'data-active': String(range === key),
                    'aria-pressed': range === key,
                    onClick: () => {
                      setRange(key);
                      setEntering(false);
                      setTip(null);
                      setHighlight(null);
                    }
                  },
                  t(key === 'half' ? 'rangeHalf' : 'rangeYear')
                )
              )
            ),
            h('span', null, t(mode === 'day' ? 'rangeHintDay' : 'rangeHintWeek')),
            h(
              'span',
              { className: 'dth-legend' },
              t('legendLess'),
              [1, 2, 3, 4].map((level) =>
                h('i', { key: level, className: 'dth-cell', 'data-level': String(level) })
              ),
              t('legendMore')
            )
          ),
          // 热力图下方一行轻提示：这里不是操作区，只负责让"格子可以点"被发现；
          // 选中并展开后自动消失，不跟数据抢注意力。
          selectedDay === null ? h('p', { className: 'dth-note' }, t('selectDate')) : null,
          h('p', { className: 'dth-note' }, t('footnote'))
        ),
        selectedDay === null ? null : renderDetail(detailOpen),
        tip === null
          ? null
          : h(
              'div',
              {
                className: 'dth-tip',
                'data-show': 'true',
                style: {
                  left: `${Math.min(tip.x + 12, (window.innerWidth || 1200) - 250)}px`,
                  top: `${Math.max(8, tip.y - 76)}px`
                }
              },
              tip.text
            )
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        // Register the complete bilingual dictionary.
        try {
          ctx.effect(
            () => ctx.locale.register(LOCALE_NS, DICTIONARIES),
            'dsh-token-heatmap: locale dictionaries'
          );
        } catch (error) {
          console.warn(
            `dsh-token-heatmap: locale registration failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        const tBound =
          typeof ctx.locale?.bind === 'function' ? ctx.locale.bind(LOCALE_NS) : undefined;

        // Register the settings section.
        try {
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              {
                name: 'settings.section',
                id: 'token-heatmap',
                order: 20,
                label: () => (typeof tBound === 'function' ? tBound('navLabel') : 'Token usage'),
                locale: LOCALE_NS
              },
              (props) => TokenHeatmap({ ...props, locale: ctx.locale, tBound })
            )
          );
        } catch (error) {
          console.warn(
            `dsh-token-heatmap: settings section registration failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    };
  }
});
