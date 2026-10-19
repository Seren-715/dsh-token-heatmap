// Exercise the plugin's host-side aggregation against the real session logs.
//
//   node test-plugin.mjs
//
// Imports `collectUsage` from the plugin package itself, so this checks the code
// that will run inside DSH rather than a copy of it.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { homedir } from 'node:os';

// 包根目录由脚本自身位置推导，不写死本机路径。
const { collectUsage } = await import(new URL('../lib/index.js', import.meta.url).href);

const sessionsRoot = process.env.DSH_SESSIONS_ROOT ?? join(homedir(), '.dsh', 'sessions');

const first = collectUsage({ sessionsRoot, timeZone: 'Asia/Shanghai', maxDepth: 2 });
console.log('first pass');
console.log(`  files       : ${String(first.files)}`);
console.log(`  records     : ${String(first.records)}`);
console.log(`  days        : ${String(first.days.length)}`);
console.log(`  totalTokens : ${first.totalTokens.toLocaleString('en-US')}`);
console.log('');
console.log('  day         total        input      output   cacheRead   calls');
for (const day of first.days) {
  console.log(
    `  ${day.day}  ${String(day.totalTokens).padStart(11)}  ${String(day.inputTokens).padStart(11)}  ${String(day.outputTokens).padStart(10)}  ${String(day.cacheReadTokens).padStart(10)}  ${String(day.calls).padStart(5)}`
  );
}
console.log('');
console.log(
  `  models: ${first.models.map((entry) => `${entry.model}=${entry.tokens.toLocaleString('en-US')} tokens / ¥${entry.cost.toFixed(4)}${entry.assumed ? ' (default price)' : ''}`).join(', ')}`
);
console.log(
  `  total cost estimate: ${first.currency} ${first.totalCost.toFixed(4)} (${first.pricing.tableUpdated})`
);

// The second call must hit the per-file cache and return identical numbers.
const startedAt = Date.now();
const second = collectUsage({ sessionsRoot, timeZone: 'Asia/Shanghai', maxDepth: 2 });
const elapsed = Date.now() - startedAt;
assert.deepEqual(second.days, first.days, 'cached daily aggregates must match');
assert.deepEqual(second.models, first.models, 'cached model aggregates must match');
if (second.totalTokens !== first.totalTokens || second.days.length !== first.days.length) {
  console.error('MISMATCH: cached pass differs from the first pass');
  process.exitCode = 1;
} else {
  console.log('');
  console.log(
    `  cached pass identical in ${String(elapsed)} ms (total ${second.totalTokens.toLocaleString('en-US')})`
  );
}

// JSON round-trip: the route serializes this payload.
const payload = JSON.stringify(second);
console.log(
  `  payload ${String(Buffer.byteLength(payload))} bytes, parses: ${Array.isArray(JSON.parse(payload).days)}`
);
