// Deterministic aggregation checks using temporary synthetic session logs.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { collectUsage } from '../lib/index.js';
import { isPeakTime } from '../lib/pricing.js';

const frameOf = (record) => zstdCompressSync(Buffer.from(`${JSON.stringify(record)}\n`));

// --- 1. Frame parsing, deduplication, cache reuse and time zone invalidation ---
const root = mkdtempSync(join(tmpdir(), 'dsh-token-heatmap-'));
try {
  const record = {
    seq: 1,
    time: Date.parse('2026-10-15T00:30:00Z'),
    data: { usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } }
  };
  const frame = frameOf(record);
  writeFileSync(join(root, 'session.v1.jsonl.zstd'), Buffer.concat([frame, frame]));
  const options = { sessionsRoot: root, maxDepth: 2, timeZone: 'UTC' };
  const first = collectUsage(options);
  assert.equal(first.days[0].day, '2026-10-15');
  assert.equal(first.totalTokens, 30, 'duplicate sequence is counted once');
  assert.equal(first.records, 1);
  assert.deepEqual(collectUsage(options).days, first.days, 'cache preserves aggregates');
  const changedZone = collectUsage({ ...options, timeZone: 'America/Los_Angeles' });
  assert.equal(changedZone.days[0].day, '2026-10-14', 'time zone changes invalidate cached dates');
  assert.equal(changedZone.totalTokens, 30);
} finally {
  rmSync(root, { recursive: true, force: true });
}

// --- 2. Peak/off-peak classification (Beijing time) ---
assert.equal(isPeakTime(Date.parse('2026-10-15T09:00:00+08:00')), true, 'Thursday 09:00 is peak');
assert.equal(isPeakTime(Date.parse('2026-10-15T11:59:00+08:00')), true, 'Thursday 11:59 is peak');
assert.equal(
  isPeakTime(Date.parse('2026-10-15T12:00:00+08:00')),
  false,
  'Thursday 12:00 is off-peak'
);
assert.equal(isPeakTime(Date.parse('2026-10-17T10:00:00+08:00')), false, 'Saturday is off-peak');
assert.equal(
  isPeakTime(Date.parse('2026-10-01T10:00:00+08:00')),
  false,
  'statutory holiday is off-peak'
);

// --- 3. Cost estimation: valley/peak tiers, model pricing and assumed fallback ---
const priced = mkdtempSync(join(tmpdir(), 'dsh-token-heatmap-cost-'));
try {
  const usage = {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 2_000_000,
    totalTokens: 4_000_000
  };
  const records = [
    // Thursday 08:30 Beijing: off-peak, Flash: 2M×0.02 + 1M×1 + 1M×4 = ¥5.04
    {
      seq: 1,
      time: Date.parse('2026-10-15T00:30:00Z'),
      data: { message: { source: { model: 'deepseek-flash' } }, usage }
    },
    // Thursday 10:30 Beijing: peak, Flash ×2 = ¥10.08
    {
      seq: 2,
      time: Date.parse('2026-10-15T02:30:00Z'),
      data: { message: { source: { model: 'deepseek-flash' } }, usage }
    },
    // Saturday 10:30 Beijing: off-peak again = ¥5.04
    {
      seq: 3,
      time: Date.parse('2026-10-17T02:30:00Z'),
      data: { message: { source: { model: 'deepseek-flash' } }, usage }
    },
    // Unknown model falls back to the Flash table and is reported as assumed.
    {
      seq: 4,
      time: Date.parse('2026-10-18T00:30:00Z'),
      data: { message: { source: { model: 'unknown-model' } }, usage: { inputTokens: 1 } }
    }
  ];
  writeFileSync(
    join(priced, 'session.v1.jsonl.zstd'),
    Buffer.concat(records.map((record) => frameOf(record)))
  );
  const result = collectUsage({ sessionsRoot: priced, maxDepth: 2, timeZone: 'UTC' });
  const byDay = new Map(result.days.map((day) => [day.day, day]));
  assert.equal(result.currency, 'CNY');
  assert.equal(result.records, 4);
  // 2026-10-15: ¥5.04 off-peak + ¥10.08 peak = ¥15.12
  assert(Math.abs(byDay.get('2026-10-15').cost - 15.12) < 1e-9, 'peak and off-peak tiers apply');
  assert(Math.abs(byDay.get('2026-10-17').cost - 5.04) < 1e-9, 'weekend uses off-peak price');
  assert(+byDay.get('2026-10-18').cost.toFixed(9) === 0.000001, 'unknown model uses default price');
  assert(Math.abs(result.totalCost - 20.160001) < 1e-9, 'daily costs sum to the total');
  const flash = result.models.find((entry) => entry.model === 'deepseek-flash');
  assert(flash !== undefined);
  assert.equal(flash.tokens, 12_000_000);
  assert(Math.abs(flash.cost - 20.16) < 1e-9);
  assert.equal(flash.assumed, false);
  const unknown = result.models.find((entry) => entry.model === 'unknown-model');
  assert.equal(unknown.assumed, true);
  assert.deepEqual(result.pricing.assumedModels, ['unknown-model']);
} finally {
  rmSync(priced, { recursive: true, force: true });
}

console.log('PASS: frames, dedupe, cache, time zone, peak tiers and cost estimation');
