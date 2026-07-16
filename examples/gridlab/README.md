# Gridlab

Gridlab is a usable local-first spreadsheet written in TSRX. It renders a
deterministic 1,000-row by 80-column planning workbook through the real
`@octanejs/tanstack-virtual` binding, with no network dependency in development
or CI.

## Product journeys

- Browse and edit a large workbook while separate vertical and horizontal
  virtualizers share the grid viewport. Column and row headers track the live
  scroll position, and the name box jumps to any address from `A1` through
  `CB1000`.
- Navigate with arrows, Page Up/Down, Home, and End; extend a range with Shift;
  press Enter or F2 to edit; and clear a range with Delete. The active row and
  column remain pinned in the public TanStack range extractor, so a focused cell
  is not discarded when ordinary scrolling moves it outside the visible window.
- Copy selected cells through the browser's native `copy` event and paste TSV
  matrices through native `paste`. The selection and focus stay in the sheet,
  and pasted numeric inputs immediately flow into dependent formulas.
- Edit with a controlled inline input that respects native composition events.
  Enter, Tab, and blur commit only after IME composition ends. The formula bar
  supports cell references with `+`, `-`, `*`, and `/`, plus rectangular
  `SUM(A1:B2)` ranges and visible error values.
- Recover from deterministic empty, first-load failure, offline, and first-sync
  failure states. Sync snapshots are revision-aware: a newer edit to the same
  cell cannot be removed when an older in-flight save completes. Every accepted
  edit is also written immediately to a versioned local workbook, whose cell
  coordinates and value bounds are validated before reload restores it.

The interface responds down to a narrow mobile viewport by compacting workbook
metadata and controls while retaining the address box, formula bar, and
scrollable sheet.

## Octane evidence

- Two `useVirtualizer` calls from `@octanejs/tanstack-virtual` run in one Octane
  component and observe the same real scroll element on perpendicular axes.
  There is no React compatibility layer and no application-owned windowing math.
- Nested keyed TSRX loops render the row/column cross-product supplied by the
  binding. The selected indices are added through TanStack Virtual's public
  `defaultRangeExtractor`, preserving the live focused DOM cell across scrolls.
- Native delegated `copy`, `paste`, `keydown`, `compositionstart`,
  `compositionend`, online, offline, and scroll events drive the workbook.
- Controlled inputs, refs-as-props, keyed reconciliation, and directive control
  flow are exercised together during editing, virtualization, and failure
  recovery.
- Loading, empty, error/retry, offline, queued, saving, failed, and saved states
  all have visible and accessible outcomes.

The production Playwright suite contains exactly five consumer journeys. It
drives Chromium's clipboard and focus, sends native composition events, scrolls
both virtual axes, rejects corrupt persisted input, reloads saved edits, forces
rapid overlapping revisions, and gates page errors and unexpected console errors
with the shared diagnostics helper.

Gridlab is intentionally client rendered. It does not claim SSR or hydration;
those evidence targets belong to examples whose manifests list those modes.

## Deterministic scenarios

- `/?scenario=empty` opens a blank workbook that can restore the sample.
- `/?scenario=load-failure` fails the first fixture load.
- `/?scenario=sync-failure` fails the first sync without losing queued edits.
- `/?scenario=recovery` combines first-load and first-sync failure for the
  resilience journey.

## Commands

From the repository root:

```bash
pnpm --dir examples/gridlab typecheck
pnpm --dir examples/gridlab build
pnpm --dir examples/gridlab test:e2e
```

`test:e2e` builds first and drives the production Vite preview on the reserved
local port `5227`. To point the suite at an already-running server, set
`GRIDLAB_EXAMPLE_BASE_URL` to an absolute HTTP(S) URL; `GRIDLAB_EXAMPLE_PORT`
overrides the local port.
