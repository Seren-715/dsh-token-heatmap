/**
 * dsh-token-heatmap —— 浏览器端（设置页组件）
 *
 * 注册进 `settings.section`，作为设置里的一节：热力图，每格一天，颜色越深当天
 * 消耗的 token 越多。数据从宿主侧的 `/dsh-token-heatmap/data` 取（同源）。
 *
 * 规范约束（DSH 插件开发文档）：
 *   * 只往 slot 里注册 React 组件，绝不往 `document.body` 塞浮层、不替换应用根节点；
 *   * 不 import 任何 Harness Client 包，React 从浏览器模块表里取；样式自己写，
 *     只用 `--dsw-alias-*` 主题变量，深浅色随之自动跟随；
 *   * **可见文案一律走 Client locale 服务**，不硬编码——否则切界面语言时这一节不动；
 *   * 样式与请求都挂在组件生命周期里，卸载即清理。
 */

window.__ModuleLoader__.load({
  id: 'dsh-token-heatmap',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const LOCALE_NS = 'settings.token-heatmap';
    const DATA_URLS = ['/dsh-token-heatmap/data', 'dsh-token-heatmap/data'];
    // 固定近一年：366 天需要 53 列（53×7 = 371 ≥ 366），正好覆盖一整年。
    const DAYS = 366;
    const WEEKS = Math.ceil(DAYS / 7);
    const WEEKDAYS = {
      zh: ['日', '一', '二', '三', '四', '五', '六'],
      en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    };

    /** 两个内置语言必须齐全（locale 服务的要求），键一一对应。 */
    const DICTIONARIES = {
      zh: {
        navLabel: 'Token 用量',
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
        rangeHintDay: '近一年 · 一格一天（一列 7 天）',
        rangeHintWeek: '近一年 · 一格一周（整列同色）',
        noRecord: '无用量记录',
        tipTotal: '总量',
        tipInput: '输入',
        tipOutput: '输出',
        tipCacheRead: '缓存读',
        tipCalls: '调用',
        tipWeekIf: '{start} 起的一周',
        tipWeek: '{start} 起的一周（本周未完）',
        legendLess: '少',
        legendMore: '多',
        footnote: '数据来自本机 DSH 会话日志，按本地日历日汇总（每周口径按自然周相加）。「总量」含缓存读；看实际消耗请选「输入+输出」。'
      },
      en: {
        navLabel: 'Token usage',
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
        rangeHintDay: 'Last year · one cell per day (7 rows)',
        rangeHintWeek: 'Last year · one cell per week (whole column)',
        noRecord: 'No usage recorded',
        tipTotal: 'Total',
        tipInput: 'Input',
        tipOutput: 'Output',
        tipCacheRead: 'Cache read',
        tipCalls: 'Calls',
        tipWeekIf: 'Week of {start}',
        tipWeek: 'Week of {start} (in progress)',
        legendLess: 'Less',
        legendMore: 'More',
        footnote: 'Aggregated from local DSH session logs by calendar day (weekly view sums natural weeks). "Total" includes cache reads; pick "Input+output" to see what you actually spent.'
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
.dth-scroll { display: flex; gap: 8px; overflow-x: auto; overflow-y: hidden; padding-bottom: 2px; min-width: 0; }
/* 用 flex 列而不是 grid-auto-flow: column —— grid 在 overflow 容器里没有固有宽度，
   会被压缩；flex 列的固有宽度是确定的。 */
.dth-weeks { display: flex; gap: 3px; width: max-content; }
.dth-week { display: flex; flex-direction: column; gap: 3px; }
/* 格子尺寸由容器宽度算出，写在 --dth-cell 上；一年 53 列永远刚好放下，不会裁掉右边。 */
.dth-cell { width: var(--dth-cell, 13px); height: var(--dth-cell, 13px); border-radius: 3px; background: var(--dsw-alias-bg-sunken, rgba(127,127,127,.16)); }
.dth-cell[data-level='1'] { background: color-mix(in srgb, var(--dsw-alias-brand-primary, #247bbf) 26%, transparent); }
.dth-cell[data-level='2'] { background: color-mix(in srgb, var(--dsw-alias-brand-primary, #247bbf) 48%, transparent); }
.dth-cell[data-level='3'] { background: color-mix(in srgb, var(--dsw-alias-brand-primary, #247bbf) 72%, transparent); }
.dth-cell[data-level='4'] { background: var(--dsw-alias-brand-primary, #247bbf); }
.dth-cell[data-today='true'] { outline: 1px solid var(--dsw-alias-label-primary, currentColor); outline-offset: 1px; }
.dth-legend { display: flex; align-items: center; gap: 4px; }
.dth-legend i.dth-cell { display: block; }
/* 月份刻度与上面每一列一一对应：同宽同序，标签不参与排版偏移。 */
.dth-months { display: flex; gap: 3px; margin-top: 5px; width: max-content; color: var(--dsw-alias-label-tertiary, #81858c); font-size: 11px; }
.dth-month { width: var(--dth-cell, 13px); height: 14px; flex: none; position: relative; }
.dth-month span { position: absolute; left: 0; top: 0; white-space: nowrap; }
.dth-foot { display: flex; align-items: center; gap: 10px; color: var(--dsw-alias-label-secondary, #61666b); font-size: 12px; }
.dth-note { color: var(--dsw-alias-label-tertiary, #81858c); font-size: 12px; line-height: 20px; margin: 0; }
.dth-error { color: #d9534f; }
.dth-tip {
  position: fixed; z-index: 2147483001; padding: 7px 10px; border-radius: 8px;
  background: rgba(24,26,30,.95); color: #f4f6f8; font-size: 12px; line-height: 18px;
  pointer-events: none; opacity: 0; transition: opacity 120ms ease-out; white-space: pre;
}
.dth-tip[data-show='true'] { opacity: 1; }
`;

    const valueOf = (day, metric) => {
      if (day === undefined || day === null) return 0;
      if (metric === 'io') return (day.inputTokens || 0) + (day.outputTokens || 0);
      return day[metric] || 0;
    };

    // 数字单位按语言走：中文用万/亿，英文用 K/M/B（英文界面下显示"1.23 亿"就露馅了）。
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

    // 月份刻度：中文用 "10月"，英文用 "Oct"。
    const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthLabel = (monthIndex, language) => (language === 'zh' ? `${monthIndex + 1}月` : MONTHS_EN[monthIndex]);

    // 本地日历日；不用 toISOString，避免时区把日期推错一天。
    const dayKey = (date) => {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${date.getFullYear()}-${month}-${day}`;
    };

    // 分位数分级：颜色只反映"你自己"的相对高低，换口径时层次依然可读。
    const buildCuts = (values) => {
      const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
      if (sorted.length === 0) return [0, 0, 0, 0];
      const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
      return [at(0.25), at(0.5), at(0.75), at(0.95)];
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
          const response = await fetch(url, { headers: { accept: 'application/json' }, credentials: 'same-origin' });
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

    /** 组件用不到翻译时给一个回退：优先用框架注入的 t 席位。 */
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
      const [cell, setCell] = React.useState(13);
      const [tip, setTip] = React.useState(null);
      const [language, setLanguage] = React.useState(() => props?.language ?? 'en');
      const frameRef = React.useRef(null);
      const t = makeTranslate(props, props?.tBound);

      // 语言变化时重渲染：locale 快照每次变化都会通知（切语言或补注册字典）。
      React.useEffect(() => {
        const locale = props?.locale;
        if (locale === undefined || typeof locale.subscribe !== 'function') return;
        const read = () => {
          const snapshot = typeof locale.getSnapshot === 'function' ? locale.getSnapshot() : undefined;
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

      // 自动刷新：挂载时拉一次，之后每分钟拉一次，并在页面重新可见/获得焦点时补拉。
      // 后端有文件级缓存（按 size+mtime 失效），一分钟一次几乎不耗资源。
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
            // 已经拿到过数据就不要因为一次刷新失败把画面清空。
            if (alive) setFailure((previous) => (previous === null ? (error instanceof Error ? error.message : String(error)) : previous));
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

      // 按容器宽度算格子尺寸：一年 53 列，算出来正好铺满，不裁右边、不留滚动条。
      // 上限 13px（不放大到失真），下限 7px（再窄就交给横向滚动，而不是把格子压没）。
      React.useEffect(() => {
        const element = frameRef.current;
        if (element === null) return;
        const compute = () => {
          const available = element.clientWidth;
          const width = Math.floor((available - (WEEKS - 1) * 3) / WEEKS);
          setCell(Math.max(7, Math.min(13, width)));
        };
        compute();
        if (typeof ResizeObserver !== 'function') return;
        const observer = new ResizeObserver(compute);
        observer.observe(element);
        return () => observer.disconnect();
      }, []);

      // "今天"每帧重算：跨过零点后，下一次渲染就会把描边挪到新的一天。
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayKey = dayKey(today);
      const weekdayNames = WEEKDAYS[language] ?? WEEKDAYS.en;

      const days = payload?.days ?? [];
      const byDay = new Map(days.map((day) => [day.day, day]));

      // 近一年：起点取"今天所在周的周日"，保证每一列都是完整自然周，
      // 末尾多出来的几天（今天之后）留空。
      const start = new Date(today);
      start.setDate(start.getDate() - (DAYS - 1));
      start.setDate(start.getDate() - start.getDay());
      // 保留原日期对象，避免日期加减被隐式字符串化。
      const at = (offset) => {
        const date = new Date(start);
        date.setDate(date.getDate() + offset);
        return date;
      };

      // 每周口径：把自然周（周日→周六）内的每一天加起来。当天之后的格子不计入。
      const weekTotals = [];
      for (let offset = 0; offset < WEEKS * 7; offset += 1) {
        const date = at(offset);
        if (date.getTime() > today.getTime()) continue;
        const bucket = (weekTotals[Math.floor(offset / 7)] ??= {
          weekStart: new Date(date),
          totalTokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
          calls: 0, done: false, lastDay: null
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
        if (date.getTime() === today.getTime() || date.getDay() === 6) bucket.done = true;
        bucket.lastDay = dayKey(date);
      }

      const dayValues = days.map((day) => valueOf(day, metric));
      const weekValues = weekTotals.map((week) => (week === undefined ? 0 : valueOf(week, metric)));

      /** 把 7 天一组的数据铺成"每列一周"的格子，供两种口径共用。 */
      const buildColumns = (cellsFor) => {
        const columns = [];
        const labels = [];
        for (let week = 0; week < WEEKS; week += 1) {
          const columnCells = [];
          let label = '';
          for (let weekday = 0; weekday < 7; weekday += 1) {
            const date = at(week * 7 + weekday);
            if (label === '' && date.getDate() === 1) label = monthLabel(date.getMonth(), language);
            if (date.getTime() > today.getTime()) {
              columnCells.push(h('div', { key: `x${week}-${weekday}`, className: 'dth-cell', style: { visibility: 'hidden' } }));
              continue;
            }
            columnCells.push(cellsFor({ week, weekday, date, key: dayKey(date) }));
          }
          columns.push(h('div', { key: `w${week}`, className: 'dth-week' }, columnCells));
          labels.push(h('div', { key: `m${week}`, className: 'dth-month' }, label === '' ? null : h('span', null, label)));
        }
        return { columns, labels };
      };

      const hoverHandlers = (text) => ({
        onMouseEnter: (event) => setTip({ text, x: event.clientX, y: event.clientY }),
        onMouseLeave: () => setTip(null)
      });

      const breakdown = (record) => [
        `${t('tipTotal')} ${formatFull(record.totalTokens)}`,
        `${t('tipInput')} ${formatFull(record.inputTokens)}   ${t('tipOutput')} ${formatFull(record.outputTokens)}`,
        `${t('tipCacheRead')} ${formatFull(record.cacheReadTokens)}   ${t('tipCalls')} ${record.calls}`
      ].join('\n');

      // 每天视图：一格一天，四档分位色阶。
      const dayCuts = buildCuts(dayValues);
      const dayView = buildColumns(({ date, key }) => {
        const record = byDay.get(key);
        const head = `${key} ${weekdayNames[date.getDay()]}`;
        return h('div', {
          key,
          className: 'dth-cell',
          'data-level': String(levelOf(valueOf(record, metric), dayCuts)),
          ...(key === todayKey ? { 'data-today': 'true' } : {}),
          ...hoverHandlers(record === undefined ? `${head}\n${t('noRecord')}` : `${head}\n${breakdown(record)}`)
        });
      });

      // 每周视图：整列 7 格同色、同 tooltip；格子与每天视图同尺寸，形状一致。
      const weekCuts = buildCuts(weekValues.filter((value) => value > 0));
      const weekView = buildColumns(({ week, date, key }) => {
        const bucket = weekTotals[week];
        const value = bucket === undefined ? 0 : valueOf(bucket, metric);
        const range = bucket === undefined
          ? t('tipWeekIf', { start: key })
          : t(bucket.done ? 'tipWeekIf' : 'tipWeek', { start: dayKey(bucket.weekStart) });
        const text = bucket === undefined
          ? `${range}\n${t('noRecord')}`
          : `${range}\n${t('tipTotal')} ${formatFull(value)}\n${breakdown(bucket)}`;
        return h('div', {
          key: `k${week}-${date.getDay()}`,
          className: 'dth-cell',
          'data-level': String(levelOf(value, weekCuts)),
          ...(date.getTime() === today.getTime() ? { 'data-today': 'true' } : {}),
          ...hoverHandlers(text)
        });
      });

      const activeView = mode === 'day' ? dayView : weekView;

      const currentWeek = weekTotals[Math.floor((today.getTime() - start.getTime()) / 86400000 / 7)];
      const summary = failure !== null
        ? h('span', { className: 'dth-error' }, t('loadFailed', { message: failure }))
        : payload === null
          ? t('loading')
          : h(React.Fragment, null,
            `${t('summaryToday')} `,
            h('b', null, formatTokens(valueOf(byDay.get(todayKey), metric), language)),
            ` · ${t('summaryWeek')} `,
            h('b', null, formatTokens(currentWeek === undefined ? 0 : valueOf(currentWeek, metric), language)),
            ` · ${t('summaryTotal')} `,
            h('b', null, formatTokens(payload.totalTokens ?? 0, language))
          );

      return h('div', { className: 'dth-root', ref: frameRef, style: { '--dth-cell': `${cell}px` } },
        h('div', { className: 'dth-head' },
          h('div', { className: 'dth-seg' },
            METRICS.map((key) => h('button', {
              key,
              type: 'button',
              'data-active': String(key === metric),
              onClick: () => setMetric(key)
            }, t(METRIC_KEYS[key])))
          ),
          h('div', { className: 'dth-seg', 'data-align': 'end' },
            MODES.map((entry) => h('button', {
              key: entry.key,
              type: 'button',
              'data-active': String(entry.key === mode),
              onClick: () => setMode(entry.key)
            }, t(entry.labelKey)))
          )
        ),
        h('div', { className: 'dth-line' }, h('span', { className: 'dth-summary' }, summary)),
        h('div', { className: 'dth-scroll' },
          h('div', null,
            h('div', { className: 'dth-weeks' }, activeView.columns),
            h('div', { className: 'dth-months' }, activeView.labels)
          )
        ),
        h('div', { className: 'dth-foot' },
          h('span', null, t(mode === 'day' ? 'rangeHintDay' : 'rangeHintWeek')),
          h('span', { className: 'dth-legend' },
            t('legendLess'),
            [1, 2, 3, 4].map((level) => h('i', { key: level, className: 'dth-cell', 'data-level': String(level) })),
            t('legendMore')
          )
        ),
        h('p', { className: 'dth-note' }, t('footnote')),
        tip === null ? null : h('div', {
          className: 'dth-tip',
          'data-show': 'true',
          style: {
            left: `${Math.min(tip.x + 12, (window.innerWidth || 1200) - 250)}px`,
            top: `${Math.max(8, tip.y - 76)}px`
          }
        }, tip.text)
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        // ① 注册本节的文案字典。两个内置语言必须齐全，否则 register 会抛。
        try {
          ctx.effect(() => ctx.locale.register(LOCALE_NS, DICTIONARIES), 'dsh-token-heatmap: locale dictionaries');
        } catch (error) {
          console.warn(`dsh-token-heatmap: locale registration failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        const tBound = typeof ctx.locale?.bind === 'function' ? ctx.locale.bind(LOCALE_NS) : undefined;

        // ② 注册设置页的一节。
        try {
          ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section',
            id: 'token-heatmap',
            order: 20,
            label: () => (typeof tBound === 'function' ? tBound('navLabel') : 'Token usage'),
            locale: LOCALE_NS
          }, (props) => TokenHeatmap({ ...props, locale: ctx.locale, tBound })));
        } catch (error) {
          console.warn(`dsh-token-heatmap: settings section registration failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };
  }
});
