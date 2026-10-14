# dsh-token-heatmap

[中文](README.zh.md) | English

A **daily token-usage heatmap** that adds a "Token Usage" section to the DSH settings page. One cell per day, darker means more tokens consumed that day.

All data comes from DSH's own local session logs — **no network requests, no separate bookkeeping**.

> **Privacy**: this plugin makes no outbound requests. Session logs are read on the local machine only, and the aggregated result is served to your local DSH page. The repository contains no personal data or credentials.

## Features

- **Daily / Weekly** toggle: one cell per day, or one cell per week (a whole column shares one colour)
- **Four token metrics**: total / input+output / cache read / output
- **One year, 53 columns × 7 rows**, aligned to natural weeks (Sunday→Saturday); cells after today stay empty
- Cell size **adapts to the container width** (7–13px) so the chart always fits — no clipping, no scrollbar
- Hover a cell for that day's or week's breakdown (total, input, output, cache read, call count)
- Summary line: today / this week / all time
- Refreshes every minute, and immediately when the window regains focus or visibility
- Follows the host theme (light/dark); styling uses only `--dsw-alias-*` tokens

## Data source

`<DSH_HOME>/sessions/<project>/<session>/session.v*.jsonl.zstd`

Every assistant message carries `data.usage`:

```
inputTokens / outputTokens / cacheReadTokens / cacheWriteTokens / totalTokens
```

plus `time` (epoch milliseconds) and `data.message.source.model`. Bucketing those by local calendar day gives the daily totals.

Three details that must be handled correctly:

1. **The log is a concatenation of zstd frames** — a one-shot decompress returns only the first frame, so it has to be split on the frame magic and decompressed frame by frame.
2. **The same `seq` can appear more than once** (replay) — deduplicate by `seq`, otherwise a day gets inflated.
3. **A truncated frame can appear at the tail** while a session is being written — skip that frame only, never drop the whole file.

The host side caches per file keyed on `size + mtime`, so a warm pass takes about 4–5ms and only new or changed logs are re-parsed.

### About the metrics

In DeepSeek's accounting, **cache reads are usually over 95% of `totalTokens`**, so the "total" metric mostly reflects cache hits. To see what you actually spent, pick **"input+output"**.

Colour buckets use **quantiles** (the 25/50/75/95th percentile of your own data) rather than absolute thresholds, so the chart stays readable even though the four metrics differ by orders of magnitude.

## Install

The desktop app's profile is managed exclusively by the app, and `dsh plugin` refuses to touch it, so install from inside the app:

1. Open DSH → sidebar **Plugins** → **Add plugin**
2. Enter the absolute path to this directory (the CLI form is `dsh plugin add "link:<path>"`)
3. Install, then restart the app
4. Open **Settings** — a "Token Usage" entry appears in the navigation

Uninstall: open the bundle's card on the same page → Uninstall.

## Configuration

Optional, set in the bundle row's `config`. Defaults apply when omitted.

| Key | Default | Meaning |
| --- | --- | --- |
| `timeZone` | `Asia/Shanghai` | Which time zone decides a "day" |
| `sessionsRoot` | `<DSH_HOME>/sessions` | Session log root directory |
| `maxDepth` | `2` | Directory depth to walk (project / session) |

## Layout

| Path | Purpose |
| --- | --- |
| `lib/index.js` | Host side: frame-by-frame decompression, daily aggregation, serves `/dsh-token-heatmap/data` |
| `client.js` | Browser side: the React component registered into `settings.section` |
| `package.json` | Manifest: `dsh.bundle.patch` for mounting, `dsh.client` for the browser half |
| `cordis.patch.yml` | Mount declaration; the `insert` `name` must match the package name exactly |
| `tools/test-plugin.mjs` | Runs the host-side aggregation over real session logs |
| `tools/test-apply.mjs` | Runs `apply()` against a stub Cordis context to check route registration |
| `tools/test-weekly.mjs` | Verifies weekly aggregation: week boundaries, month ticks, no double counting |

Self-tests (require existing DSH session logs on the machine):

```bash
node tools/test-plugin.mjs
node tools/test-apply.mjs
node tools/test-weekly.mjs
```

## Implementation notes

**The UI goes through a slot, it does not inject DOM.** The component registers into `settings.section` and only renders React elements. It imports no Harness client package and writes its own styles using theme tokens only. (The DSH plugin guide explicitly forbids appending to `document.body` or replacing the app root.)

**Adaptive sizing.** A `ResizeObserver` measures the container and computes each cell's edge length into the CSS variable `--dth-cell`. One year of 53 columns yields 9–13px cells between 640px and 900px of available width, always fitting exactly.

**Week alignment.** The range starts on the Sunday of the current week, so every column is a complete natural week, and cells after today stay empty. The month tick is placed on the column that contains the 1st of that month, so it always lines up with the grid.

## License

MIT
