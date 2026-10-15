# dsh-token-heatmap

[中文](README.zh.md) | English

A **daily token-usage heatmap** that adds a "Token Usage" section to the DSH settings page. One cell per day, darker means more tokens consumed that day.

All data comes from DSH's own local session logs — **no network requests, no separate bookkeeping**.

> **Privacy**: this plugin makes no outbound requests. Session logs are read on the local machine only, and the aggregated result is served to your local DSH page. The repository contains no personal data or credentials.

## Screenshots

These screenshots show the previous version for installation and localization reference. The current version defaults to six months, splits the year into two rows, and adds inline daily details.

Settings → **Token usage** (previous English UI):

![English interface](docs/screenshot-en.png)

The same section with the UI switched to Chinese — every label, month tick and number unit follows the language:

![Chinese interface](docs/screenshot-zh.png)

## Features

- Default half-year range (26 weeks); full year uses two rows (27 + 26 weeks), each with month labels
- Cells capped at 20px with 4px gaps, sized to the container to avoid horizontal scrollbars
- **Daily / Weekly** views: daily levels or one shared level per natural week; Sunday–Saturday, future dates empty
- **Four metrics**: total / input+output / cache read / output, rendered in theme-aware grayscale
- Hover or focus shows only the selected metric's Token count and a click hint; weekly counts are labeled
- Click a date for inline daily details below the heatmap: total, input, output, cache reads, calls, and nonzero cache writes; weekly cells open their actual day
- Proportional Token composition bar with percentages and an empty state
- Approximately 600ms diagonal entrance without delaying the summary; filters and date selection do not replay it
- Native buttons support Enter/Space and focus feedback; respects system reduced-motion preferences
- Today / this week / all-time summary; minute refresh plus refresh on visibility or focus
- Chinese/English labels, month names and number units; follows the host light/dark theme

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

Total includes cache reads reported in the logs; their share depends on usage. Input+output counts only those two fields. Token counts are not billed currency amounts; this plugin does not calculate costs.

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
| `tools/test-client.mjs` | Client rendering and interaction checks using React hook stubs |
| `tools/test-weekly.mjs` | Verifies weekly aggregation: week boundaries, month ticks, no double counting |

Use a Node.js version supporting `node:zlib` / `zstdDecompressSync` (Node.js 24 recommended). Client and weekly tests need no session logs. Host aggregation tests use local logs; set `DSH_SESSIONS_ROOT` to override the path.

Self-tests:

```bash
node tools/test-client.mjs
node tools/test-plugin.mjs
node tools/test-apply.mjs
node tools/test-weekly.mjs
```

## Implementation notes

**The UI goes through a slot, it does not inject DOM.** The component registers into `settings.section` and only renders React elements. It imports no Harness client package and writes its own styles using theme tokens only. (The DSH plugin guide explicitly forbids appending to `document.body` or replacing the app root.)

**Adaptive sizing.** A `ResizeObserver` measures the container and computes each cell's edge length into the CSS variable `--dth-cell`. Sizing fits 26 columns for the half year and at most 27 columns per row for the year, capped at 20px and accounting for gaps and padding.

**Week alignment.** The range starts 25 or 52 weeks before the Sunday of the current week, so every column is a complete natural week, and cells after today stay empty. The month tick is placed on the column that contains the 1st of that month, so it always lines up with the grid.

**Localization.** Visible text is never hardcoded. The plugin registers its own dictionary namespace with `ctx.locale.register(ns, { zh, en })` and reads it through the framework's injected `t` seat, so a language switch re-renders the section. Number units are localized too (`万/亿` in Chinese, `K/M/B` in English).

Client checks execute `client.js` with React hook stubs, covering the first visible render, compact tooltips, inline details, range switching and composition. They do not replace layout, animation, focus or theme verification in DSH.

See [CHANGELOG.md](CHANGELOG.md) for changes.

## License

MIT
