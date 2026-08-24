# Upstream provenance

`@octanejs/calendar` is pinned to `react-calendar@6.0.1` (wojtekmaj). This is
not `react-day-picker`; `packages/day-picker` is a separate binding.

- repository: https://github.com/wojtekmaj/react-calendar
- package path: `packages/react-calendar`
- tag commit: `dc73f86f68239cb694650b66e0795a2f7f9323ed`
- advertised range: `6.0.x`
- license: MIT
- npm integrity: `sha512-b8E61W7qk/He9XEbtbQBjnALPuGmxeglsotgZyAShqN1vHMzXWjl4g7WI5tRF93RE4Wbo0c0BKN3vTQhrBojpg==`

## Source boundary

- `upstream/canonical/` is the byte-exact `packages/react-calendar` tree at the
  pinned commit (source, specs, LICENSE).
- `upstream/npm/` is the byte-exact published tarball payload, including
  authored source, compiled runtime/declarations, CSS, package metadata, and
  README.
- Octane `src/` mirrors the canonical module layout. CSS is published from
  `src/Calendar.css` (canonical stylesheet, not a rewrite).

Vendored evidence is development-only and excluded from package `files`.

The upstream `forwardRef` wrapper is removed because Octane receives `ref` as
an ordinary prop. `useImperativeHandle` still populates it with the upstream
calendar handle, while `inputRef` still owns the main `HTMLDivElement`. React's
synthetic `event.persist()` call is omitted because Octane passes a persistent
native `MouseEvent`.

## Export crosswalk

| Upstream export | Octane status | Evidence / divergence |
| --- | --- | --- |
| default `Calendar` | Ported (unwrapped from `forwardRef`; imperative handle retained with `useImperativeHandle`) | `tests/Calendar.spec.ts`, `tests/exports.spec.ts` |
| named `Calendar` | Ported | `tests/exports.spec.ts` |
| `CenturyView` | Ported | `tests/exports.spec.ts`, view-rendering cases |
| `DecadeView` | Ported | `tests/exports.spec.ts`, view-rendering cases |
| `MonthView` | Ported | `tests/exports.spec.ts`, `tests/MonthView/*` |
| `YearView` | Ported | `tests/exports.spec.ts`, view-rendering cases |
| `Navigation` | Ported | `tests/Calendar.spec.ts` (navigation presence) |
| `CalendarProps` | Ported | `src/Calendar.tsrx` |
| `CalendarType` | Ported | `src/shared/types.ts` |
| `NavigationLabelFunc` | Ported; returns `OctaneNode` | `src/shared/types.ts` |
| `OnArgs` | Ported | `src/shared/types.ts` |
| `OnClickFunc` | Ported; receives native `MouseEvent` | `src/shared/types.ts` |
| `OnClickWeekNumberFunc` | Ported; receives native `MouseEvent` | `src/shared/types.ts` |
| `TileArgs` | Ported | `src/shared/types.ts` |
| `TileClassNameFunc` | Ported | `src/shared/types.ts` |
| `TileContentFunc` | Ported; returns `OctaneNode` | `src/shared/types.ts` |
| `TileDisabledFunc` | Ported | `src/shared/types.ts` |
| `./Calendar.css` | Ported | `src/Calendar.css` |
| `./dist/Calendar.css` | Compatibility alias of the same stylesheet | package exports |

## Upstream test disposition

Framework-neutral shared suites retain every upstream case and assertion. Only
their import paths and repository formatting differ after moving them from
colocated `src/shared/*.spec.ts` to `tests/shared`.

| Upstream artifact | Disposition |
| --- | --- |
| `src/shared/dates.spec.ts` | Run as-is in `tests/shared/dates.spec.ts` |
| `src/shared/utils.spec.ts` | Run as-is in `tests/shared/utils.spec.ts` |
| `src/shared/dateFormatter.spec.ts` | Run as-is in `tests/shared/dateFormatter.spec.ts` |
| `src/Calendar.spec.tsx` | Representative cases adapted in `tests/Calendar.spec.ts` (className, data-testid, inputRef, navigation, value/view/activeStartDate, onChange activeStartDate, view rendering, week numbers). Remaining drill/range/format-passthrough cases are a parity gap |
| `src/Flex.spec.tsx` | All four cases adapted in `tests/Flex.spec.ts` |
| `src/Tile.spec.tsx` | Representative host, click, class, child/abbr, formatter, content, and disabled cases adapted in `tests/Tile.spec.ts`; remaining cases are a parity gap |
| `src/MonthView/Day.spec.tsx` | Representative class, weekend/neighboring, abbreviation, date-bound, click, and hover cases adapted in `tests/MonthView/Day.spec.ts`; remaining cases are a parity gap |
| `src/MonthView/WeekNumber.spec.tsx` | All three cases adapted in `tests/MonthView/WeekNumber.spec.ts` |
| `src/Calendar/Navigation.spec.tsx` | Follow-up; Navigation presence/absence is covered through `tests/Calendar.spec.ts` |
| `src/CenturyView.spec.tsx` | Follow-up; century view rendering is covered through `tests/Calendar.spec.ts` |
| `src/CenturyView/Decade.spec.tsx` | Follow-up |
| `src/DecadeView.spec.tsx` | Follow-up; decade view rendering is covered through `tests/Calendar.spec.ts` |
| `src/DecadeView/Year.spec.tsx` | Follow-up |
| `src/MonthView.spec.tsx` | Follow-up; month view rendering is covered through `tests/Calendar.spec.ts` |
| `src/MonthView/WeekNumbers.spec.tsx` | Follow-up; Calendar `showWeekNumbers` cases are adapted |
| `src/MonthView/Weekdays.spec.tsx` | Follow-up |
| `src/YearView.spec.tsx` | Follow-up; year view rendering is covered through `tests/Calendar.spec.ts` |
| `src/YearView/Month.spec.tsx` | Follow-up |

Upstream specs use `vitest/browser` + `vitest-browser-react`. Adapted files use
`@octanejs/testing-library` and keep the upstream case titles and numeric
assertions. No adapted assertion is weakened. `tests/exports.spec.ts` is an
Octane package-surface contract; the additional non-element case in
`tests/Flex.spec.ts` is an Octane-only descriptor-array guard.

## Intentional divergences

- Component refs are ordinary Octane props. `Calendar` `ref` exposes the
  upstream imperative handle; `inputRef` remains the DOM wrapper ref. There is
  no `forwardRef`.
- Tile/navigation callbacks receive native `MouseEvent` objects. Native events
  persist without React's `event.persist()`.
- Public renderable types use `OctaneNode` instead of `React.ReactNode`.
- `Flex` receives descriptor arrays through the `children` prop, filters them
  with `isValidElement`, and clones only valid descriptors.
