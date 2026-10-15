# dsh-token-heatmap

[中文](README.zh.md) | English

A **daily token-usage heatmap** that adds a "Token Usage" section to the DSH settings page. One cell per day, theme-aware grayscale indicates relative usage.

All data comes from DSH's own local session logs — **no external network requests or separate usage ledger**.

> **Privacy**: this plugin makes no outbound requests. Session logs are read on the local machine only, and the aggregated result is served to your local DSH page. The repository contains no personal data or credentials.

## What makes this plugin different

- **A real settings section, not an overlay.** It registers into the host's `settings.section` slot and renders React only. It never appends to `document.body`, never replaces the app root, and imports no Harness client package — so it sits in the sidebar next to the built-in pages instead of floating on top of them.
- **Fully offline, single data source.** Nothing is sent anywhere and there is no extra ledger to maintain: every number is derived from the session logs DSH already writes.
- **Parses the log format for real.** Concatenated zstd frames, replayed `seq` values and truncated tail frames are all handled explicitly — a naive single decompression only ever yields the first frame. See [Data source](#data-source).
- **Readable at both ends of the scale.** Four metrics differ by orders of magnitude, so colour levels are **quantiles of your own data**, not absolute thresholds. Cache reads often dominate a day (99% in the screenshots), which is why "input+output" is one click away.
- **Brightness is reserved for data.** Days with no recorded usage are pinned to the dimmest step, so an empty half-year grid stays quiet and the days you actually used stand out.
- **The interaction keeps its place.** Collapsing a day's details keeps the selection outline on the heatmap, another click switches days without collapsing first, and `Esc` collapses before it clears. No flow forces you to close a panel to look at another day.
- **Native where it counts.** Theme tokens come from the host (`--dsw-alias-*`), and visible text is registered through `ctx.locale.register` so switching the app language switches this section too — including number units (`万/亿` vs `K/M/B`).
- **Regression tests instead of claims.** Five self-test entry points cover frame parsing, deduplication, caching, weekly boundaries, client rendering and route registration. See [Layout](#layout).

## Screenshots

### Half-year heatmap and compact tooltip

Open Settings → **Token usage**. The default range is six months. Choose total, input+output, cache read or output, and switch between daily and weekly views. The range selector offers six months or a full year; the year is split into two rows.

Hover a date cell to display three lines: the date (YYYY-MM-DD), the selected metric's Token count, and “Click to view details”. The example below shows 2026-10-13 with a total of 117,405,946 Token. Clicking the cell opens that day's breakdown below the heatmap. The outline indicates hover or selection; today's cell has no default highlight. Cells with no recorded usage stay at the dimmest step, so brightness is reserved for days that actually have usage.

![English half-year heatmap and tooltip](docs/heatmap-en.png)

### Inline daily details and Token composition

Click a date to show its details below the heatmap without leaving the page; a one-line hint above the footnote points this out until you pick a date. Click the selected date again to collapse the body — the selection outline stays on the heatmap, so you can still see which day is pinned — or select another day to switch the details directly. The collapsed row keeps an expand control, and `Esc` on a focused cell collapses first and clears the selection second. Filters remain available.

Details include the total, input, output, cache reads and calls, plus cache writes when present. The grayscale bar shows each component's share by Token count. The October 13, 2026 example shows 117,405,946 Token, with cache reads accounting for 99.09%. These are screenshot examples; your statistics come from your local logs.

![English daily details and Token composition](docs/detail-en.png)

### Chinese interface

Labels, months, dates and number units follow the host language. The same daily total appears as “1.17 亿” in Chinese and “117.41M” in English.

![Chinese half-year heatmap and tooltip](docs/heatmap-zh.png)

![Chinese daily details and Token composition](docs/detail-zh.png)

## Features

- Default half-year range (26 weeks); full year uses two rows (27 + 26 weeks), each with month labels
- Cells capped at 20px with 4px gaps, sized to the container to avoid horizontal scrollbars
- **Daily / Weekly** views: daily levels or one shared level per natural week; Sunday–Saturday, future dates empty
- **Four metrics**: total / input+output / cache read / output, rendered in theme-aware grayscale
- Hover or focus shows the cell's date, the selected metric's Token count and a click hint; weekly counts are labeled
- Click a date for inline daily details below the heatmap: total, input, output, cache reads, calls, and nonzero cache writes; weekly cells open their actual day
- Clicking the selected date collapses the detail body but keeps its outline; an expand control and `Esc` both collapse, and another click switches days without collapsing first
- Proportional Token composition bar with percentages and an empty state
- Approximately 600ms diagonal entrance without delaying the summary; filters and date selection do not replay it
- Native buttons support Enter/Space and focus feedback; respects system reduced-motion preferences
- Today / this week / all-time summary; minute refresh plus refresh on visibility or focus
- Chinese/English labels, month names and number units; follows the host light/dark theme

## Data source

`<DSH_HOME>/sessions/<project>/<session>/session.v*.jsonl.zstd`

The plugin reads log records containing a valid timestamp and `data.usage`:

```
inputTokens / outputTokens / cacheReadTokens / cacheWriteTokens / totalTokens
```

plus `time` (epoch milliseconds) and `data.message.source.model`. Bucketing those by local calendar day gives the daily totals.

Three details that must be handled correctly:

1. **Logs contain concatenated zstd frames** — the parser locates frame magic bytes and decompresses frames separately to retain readable frames.
2. **The same `seq` can appear more than once** (replay) — deduplicate by `seq`, otherwise a day gets inflated.
3. **A truncated frame can appear at the tail** while a session is being written — skip that frame only, never drop the whole file.

Parsed results are cached by file size, modification time and aggregation time zone. New or changed files, and files whose aggregation time zone has changed, are parsed again.

### About the metrics

Total includes cache reads reported in the logs; their share depends on usage. Input+output counts only those two fields. Token counts are not billed currency amounts; this plugin does not calculate costs.

Colour buckets use **quantiles** (the 25/50/75th percentile of your own data) rather than absolute thresholds, so the chart stays readable even though the four metrics differ by orders of magnitude.

## Install

The desktop app's profile is managed exclusively by the app, and `dsh plugin` refuses to touch it, so install from inside the app:

1. Open DSH → sidebar **Plugins** → **Add plugin**
2. Enter the absolute path to this directory (the CLI form is `dsh plugin add "link:<path>"`)
3. Install, then restart the app
4. Open **Settings** — a "Token Usage" entry appears in the navigation

Uninstall: open the bundle's card on the same page → Uninstall.

## Configuration

Optional, set in the bundle row's `config`. Defaults apply when omitted.

| Key            | Default               | Meaning                                     |
| -------------- | --------------------- | ------------------------------------------- |
| `timeZone`     | `Asia/Shanghai`       | Which time zone decides a "day"             |
| `sessionsRoot` | `<DSH_HOME>/sessions` | Session log root directory                  |
| `maxDepth`     | `2`                   | Directory depth to walk (project / session) |

## Layout

| Path                    | Purpose                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `lib/index.js`          | Host side: frame-by-frame decompression, daily aggregation, serves `/dsh-token-heatmap/data` |
| `client.js`             | Browser side: the React component registered into `settings.section`                         |
| `package.json`          | Manifest: `dsh.bundle.patch` for mounting, `dsh.client` for the browser half                 |
| `cordis.patch.yml`      | Mount declaration; the `insert` `name` must match the package name exactly                   |
| `tools/test-plugin.mjs` | Runs the host-side aggregation over real session logs                                        |
| `tools/test-apply.mjs`  | Runs `apply()` against a stub Cordis context to check route registration                     |
| `tools/test-client.mjs` | Client rendering and interaction checks using React hook stubs                               |
| `tools/test-host.mjs`   | Synthetic-log checks for frames, deduplication, caching and time zone changes                |
| `tools/test-weekly.mjs` | Verifies weekly aggregation: week boundaries, month ticks, no double counting                |

Use a Node.js version supporting `node:zlib` / `zstdDecompressSync` (Node.js 24 recommended). Client and weekly tests need no session logs. `npm test` uses deterministic fixtures and host stubs. `npm run test:logs` reads local logs; set `DSH_SESSIONS_ROOT` to override the path.

Self-tests:

```bash
npm ci
npm run check
npm test
npm run test:logs
```

Formatting is defined by `.editorconfig` and Prettier. Run `npm run format` to format the repository and `npm run check` to check formatting and entry-point syntax. Prettier is a development dependency only.

## Implementation notes

**The UI goes through a slot, it does not inject DOM.** The component registers into `settings.section` and only renders React elements. It imports no Harness client package and writes its own styles primarily using host theme tokens. (The DSH plugin guide explicitly forbids appending to `document.body` or replacing the app root.)

**Adaptive sizing.** A `ResizeObserver` measures the container and computes each cell's edge length into the CSS variable `--dth-cell`. Sizing fits 26 columns for the half year and at most 27 columns per row for the year, capped at 20px and accounting for gaps and padding.

**Week alignment.** The range starts 25 or 52 weeks before the Sunday of the current week, so every column is a complete natural week, and cells after today stay empty. Month labels are placed on columns containing the first day of a month, with an additional label at each row start.

**Localization.** Visible text is never hardcoded. The plugin registers its own dictionary namespace with `ctx.locale.register(ns, { zh, en })` and reads it through the framework's injected `t` seat, so a language switch re-renders the section. Number units are localized too (`万/亿` in Chinese, `K/M/B` in English).

Client checks execute `client.js` with React hook stubs, covering the first visible render, compact tooltips, inline details, range switching and composition. They do not replace layout, animation, focus or theme verification in DSH.

See [CHANGELOG.md](CHANGELOG.md) for changes.

## License

MIT
