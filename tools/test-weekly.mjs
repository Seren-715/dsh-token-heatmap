// 验算"每周"聚合：自然周边界、当天之后的格子不计入、不重复计数、跨月月份刻度。
// 独立日历模拟测试；客户端组件的渲染与交互由 test-client.mjs 验证。

const WEEKS = 53;

const dayKey = (date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

function simulate(todayIso, dailyValues) {
  const today = new Date(todayIso);
  today.setHours(0, 0, 0, 0);
  const byDay = new Map(Object.entries(dailyValues));

  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay() - (WEEKS - 1) * 7);
  const at = (offset) => {
    const date = new Date(start);
    date.setDate(date.getDate() + offset);
    return date;
  };

  const weekTotals = [];
  for (let offset = 0; offset < WEEKS * 7; offset += 1) {
    const date = at(offset);
    if (date.getTime() > today.getTime()) continue;
    const bucket = (weekTotals[Math.floor(offset / 7)] ??= {
      weekStart: new Date(date),
      totalTokens: 0,
      calls: 0,
      days: [],
      lastDay: null
    });
    const record = byDay.get(dayKey(date));
    if (record !== undefined) {
      bucket.totalTokens += record.totalTokens;
      bucket.calls += record.calls;
      bucket.days.push(dayKey(date));
    }
    bucket.lastDay = dayKey(date);
  }

  const labels = [];
  for (let week = 0; week < WEEKS; week += 1) {
    let label = '';
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = at(week * 7 + weekday);
      if (label === '' && date.getDate() === 1) label = `${date.getMonth() + 1}月`;
    }
    labels.push(label);
  }
  return { start, at, weekTotals, labels };
}

// —— 用例 ——
// 2026-10-14 是周三，本周为 10-11（周日）～10-17（周六），今天之后留空。
const today = '2026-10-14T00:00:00';
const daily = {
  '2026-10-05': { totalTokens: 100, calls: 1 }, // 上一周（10-04~10-10）内
  '2026-10-11': { totalTokens: 200, calls: 2 }, // 本周日
  '2026-10-12': { totalTokens: 300, calls: 3 }, // 本周一
  '2026-10-13': { totalTokens: 400, calls: 4 }, // 本周二
  '2026-10-14': { totalTokens: 500, calls: 5 }, // 今天
  '2026-10-15': { totalTokens: 999, calls: 9 } // 未来（不该计入）
};
const { start, at, weekTotals, labels } = simulate(today, daily);

const failures = [];
const check = (label, condition, detail) => {
  console.log(
    `  ${condition ? 'OK  ' : 'FAIL'} ${label}${detail === undefined ? '' : ` — ${detail}`}`
  );
  if (!condition) failures.push(label);
};

const todayDate = new Date(today);
todayDate.setHours(0, 0, 0, 0);
const todayOffset = Math.round((todayDate - start) / 86400000);
const currentWeek = Math.floor(todayOffset / 7);

console.log(
  `起点 ${dayKey(start)}（周${start.getDay()}）| 今天第 ${currentWeek} 列，列内偏移 ${todayOffset % 7}`
);
console.log('');

const lastBucket = weekTotals[currentWeek];
const previousBucket = weekTotals[currentWeek - 1];
check('本周桶存在', lastBucket !== undefined);
check('上周桶存在', previousBucket !== undefined);

// 本周 = 10-11(周日) + 10-12 + 10-13 + 10-14；10-15 是周四，尚未到达
check(
  '本周合计 = 1400（未来 10-15 的 999 不计入）',
  lastBucket?.totalTokens === 1400,
  `实际 ${lastBucket?.totalTokens}`
);
check('上一周 = 100', previousBucket?.totalTokens === 100, `实际 ${previousBucket?.totalTokens}`);

const all = weekTotals.reduce((sum, bucket) => sum + (bucket?.totalTokens ?? 0), 0);
check('全部分桶之和 = 1500（无重复、无遗漏）', all === 1500, `实际 ${all}`);

const seen = weekTotals.flatMap((bucket) => bucket?.days ?? []);
check('每个日期只出现一次', new Set(seen).size === seen.length, `共 ${seen.length} 个日期键`);

check('本周桶最后一天 = 今天', lastBucket?.lastDay === '2026-10-14', `实际 ${lastBucket?.lastDay}`);

const months = labels.filter(Boolean);
check('月份刻度 = 12 个', months.length === 12, months.join(' '));
const firstOfMonthColumns = [];
for (let week = 0; week < WEEKS; week += 1) {
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const date = at(week * 7 + weekday);
    if (date.getDate() === 1) {
      firstOfMonthColumns.push({ week, month: date.getMonth() + 1, label: labels[week] });
      break;
    }
  }
}
check(
  '每个月刻度都落在包含该月 1 号的列',
  firstOfMonthColumns.every((entry) => entry.label === `${entry.month}月`),
  firstOfMonthColumns.map((entry) => `列${entry.week}->${entry.label}`).join(' ')
);

// 已到达的格子 = 今天的列内偏移 + 1（含今天）+ 前面完整列
const arrived = todayOffset + 1;
check('已到达的格子数 = 今天偏移 + 1', arrived === 368, `实际 ${arrived}`);
check('总格数 371 = 53 列 × 7', WEEKS * 7 === 371, `实际 ${WEEKS * 7}`);

console.log('');
if (failures.length > 0) {
  console.error(`FAILURES: ${failures.join(' | ')}`);
  process.exitCode = 1;
} else {
  console.log('每周聚合全部核对通过');
}
