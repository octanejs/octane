# Pulseboard

Pulseboard is a polished, deterministic analytics console built with Octane TSRX. It models a Northstar product workspace with deep-linked overview, acquisition, and revenue reports; an accessible visitor chart; a stateful campaign report; and 360 operational events.

The example deliberately exercises browser and binding boundaries that a final-HTML test cannot cover:

- `@octanejs/visx` `ParentSize` observes a real report container, and its measured width drives Visx scales, grid rows, line geometry, and focusable SVG points;
- every chart point has a consumer-readable label and roving keyboard focus with arrow, Home, and End navigation;
- `@octanejs/tanstack-table` owns sorting, global filtering, row selection, and visible row models in a semantic native table;
- `@octanejs/tanstack-virtual` windows and dynamically measures 360 variable-content activity rows, including an off-screen incident jump;
- the responsive console retains keyboard navigation through a dismissible mobile workspace menu;
- deterministic load, refresh, empty-segment, and overlapping range states retain usable data and converge to the latest user choice.

## Product routes and fixtures

- `/workspaces/northstar/overview?range=7d`
- `/workspaces/northstar/acquisition?range=30d`
- `/workspaces/northstar/revenue?range=7d`
- add `scenario=load-failure,refresh-failure` for recoverable request failures;
- add `scenario=empty` for the restorable no-traffic segment.

All campaign, chart, and activity data is locally seeded. The application makes no network request and does not depend on wall-clock time, a private browser hook, or a remote asset.

## Run it

From the repository root:

```bash
pnpm --dir examples/pulseboard dev
pnpm --dir examples/pulseboard typecheck
pnpm --dir examples/pulseboard build
pnpm --dir examples/pulseboard test:e2e
```

The five Playwright journeys run against real Chromium and assert public behavior: route and range state, browser-measured SVG layout, pointer and keyboard chart readings, table accessibility state, bounded virtual DOM with an on-screen incident, retained data through failures, empty-state restoration, and page/console diagnostics.
