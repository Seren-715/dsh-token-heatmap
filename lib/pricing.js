/**
 * DeepSeek 官方价目表（CNY / 百万 token）与峰谷时段判定。
 *
 * DSH 会话日志的 `data.usage` 只记录 token 数量，不包含金额，因此这里按官方价目
 * 自行换算。金额统一以 1e-8 元为最小单位做整数累计，避免浮点误差。
 *
 * 价目来源：https://api-docs.deepseek.com/zh-cn/quick_start/pricing
 * 峰谷规则（官方 2026-09-19 说明）：北京时间周一至周五 09:00–12:00、14:00–18:00
 * 为高峰；其余时段，包括周末和中国法定节假日全天，均按空闲时段计价。
 * 高峰价为空闲价的 2 倍。
 *
 * ⚠️ 价目与节假日表需要维护：价格调整后更新 PRICING；国务院公布次年安排后补 HOLIDAY_VALLEY。
 */

/** 金额最小单位：1e-8 元。 */
export const MONEY_SCALE = 1e8;

/** 记账使用的币种。 */
export const CURRENCY = 'CNY';

/** Flash 系列（deepseek-flash = DeepSeek-V4.1-Flash）：[空闲价, 高峰价]。 */
const FLASH = { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] };

/** Pro 系列：Flash 的 3 倍价（官方 2026-08-17 生效）。 */
const PRO = { hit: [0.15, 0.3], miss: [4.5, 9], out: [13.5, 27] };

/**
 * 模型名子串 → 价目。匹配时按键长降序，避免短关键字误命中。
 * 未列出的模型回退到 Flash 价，并在载荷的 `assumedModels` 中标注。
 */
const PRICE_TABLE = {
  'deepseek-flash': FLASH,
  'deepseek-v4-flash-vision-exp': FLASH,
  'deepseek-v4-flash': FLASH,
  'deepseek-v4-pro': PRO,
  _default: FLASH
};

const MODEL_KEYS = Object.keys(PRICE_TABLE)
  .filter((key) => key !== '_default')
  .sort((a, b) => b.length - a.length);

/** 高峰时段（北京时间，左闭右开）。 */
const PEAK_HOURS = [
  [9, 12],
  [14, 18]
];

// 周末全天谷价自北京时间 2026-08-23 00:00 起生效。
const WEEKEND_VALLEY_FROM_MS = Date.UTC(2026, 7, 22, 16, 0, 0);

// 法定节假日全天谷价自北京时间 2026-09-19 00:00 起生效。
const HOLIDAY_VALLEY_FROM_MS = Date.UTC(2026, 8, 18, 16, 0, 0);

/**
 * 2026 年法定节假日（仅列放假日期；调休上班日均为周末，按周末谷价规则处理）。
 * 2027 年起需按国务院安排补充，否则节假日会被当作普通工作日计算。
 */
const HOLIDAY_VALLEY = new Set([
  '2026-01-01',
  '2026-01-02',
  '2026-01-03',
  '2026-02-15',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-02-19',
  '2026-02-20',
  '2026-02-21',
  '2026-02-22',
  '2026-02-23',
  '2026-04-04',
  '2026-04-05',
  '2026-04-06',
  '2026-05-01',
  '2026-05-02',
  '2026-05-03',
  '2026-05-04',
  '2026-05-05',
  '2026-06-19',
  '2026-06-20',
  '2026-06-21',
  '2026-09-25',
  '2026-09-26',
  '2026-09-27',
  '2026-10-01',
  '2026-10-02',
  '2026-10-03',
  '2026-10-04',
  '2026-10-05',
  '2026-10-06',
  '2026-10-07'
]);

/**
 * 解析模型对应的价目。
 * @param {string} model - 会话日志中的模型标识。
 * @returns {{price: {hit: number[], miss: number[], out: number[]}, assumed: boolean}}
 */
export function priceFor(model) {
  const name = String(model ?? '').toLowerCase();
  for (const key of MODEL_KEYS) {
    if (name.includes(key)) return { price: PRICE_TABLE[key], assumed: false };
  }
  return { price: PRICE_TABLE._default, assumed: true };
}

/**
 * 判断某一时刻是否属于高峰时段。
 * @param {number} timeMs - epoch 毫秒。
 * @returns {boolean}
 */
export function isPeakTime(timeMs) {
  const value = Number(timeMs);
  if (!Number.isFinite(value)) return false;
  // 北京时间无夏令时，直接按 UTC+8 读日历字段。
  const beijing = new Date(value + 8 * 3600 * 1000);
  if (value >= WEEKEND_VALLEY_FROM_MS) {
    const weekday = beijing.getUTCDay();
    if (weekday === 0 || weekday === 6) return false;
  }
  if (value >= HOLIDAY_VALLEY_FROM_MS) {
    const date = beijing.toISOString().slice(0, 10);
    if (HOLIDAY_VALLEY.has(date)) return false;
  }
  const hour = beijing.getUTCHours();
  for (const [start, end] of PEAK_HOURS) {
    if (hour >= start && hour < end) return true;
  }
  return false;
}

/**
 * 计算一条 usage 记录对应的金额。
 *
 * 金额（元）= Σ token / 1e6 × 单价；换算成 1e-8 元单位后为 token × 单价 × 100。
 * @param {object} usage - `{ inputTokens, cacheReadTokens, outputTokens }`。
 * @param {string} model - 模型标识。
 * @param {number} timeMs - 记录时间（epoch 毫秒），用于选择峰谷价。
 * @returns {{units: number, assumed: boolean}}
 */
export function recordCostUnits(usage, model, timeMs) {
  const { price, assumed } = priceFor(model);
  const tier = isPeakTime(timeMs) ? 1 : 0;
  const cacheRead = Math.max(0, Number(usage?.cacheReadTokens) || 0);
  const input = Math.max(0, Number(usage?.inputTokens) || 0);
  const output = Math.max(0, Number(usage?.outputTokens) || 0);
  const units = Math.round(
    (cacheRead * price.hit[tier] + input * price.miss[tier] + output * price.out[tier]) * 100
  );
  return { units, assumed };
}

/**
 * 将 1e-8 元单位换算为元。
 * @param {number} units
 * @returns {number}
 */
export function costFromUnits(units) {
  return units / MONEY_SCALE;
}

/** 随载荷下发的计价说明。 */
export const PRICING_META = {
  currency: CURRENCY,
  unit: 'CNY per 1M tokens',
  source: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
  tableUpdated: '2026-09-19',
  peakRule: 'Beijing time Mon–Fri 09:00–12:00 and 14:00–18:00; peak price is 2× off-peak',
  holidaysCovered: 2026
};
