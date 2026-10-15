// Deterministic aggregation checks using temporary synthetic session logs.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { collectUsage } from '../lib/index.js';

const root = mkdtempSync(join(tmpdir(), 'dsh-token-heatmap-'));
try {
  const record = {
    seq: 1,
    time: Date.parse('2026-10-15T00:30:00Z'),
    data: { usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } }
  };
  const frame = zstdCompressSync(Buffer.from(JSON.stringify(record) + '\n'));
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
  console.log('PASS: multi-frame parsing, deduplication, cache reuse and time zone invalidation');
} finally {
  rmSync(root, { recursive: true, force: true });
}
