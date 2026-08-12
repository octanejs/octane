---
title: "feat: Port react-day-picker bindings"
type: feat
status: active
date: 2026-08-02
---

# Port react-day-picker v10.0.1 to Octane

## Goal

Provide `@octanejs/day-picker` as the exact package-level migration target for `react-day-picker@10.0.1`, including its root API, locale and stylesheet entry points, selection modes, navigation, accessibility behavior, SSR, and customization hooks. This unblocks Octane's deferred shadcn date-picker surface.

## Pinned upstream

- Repository: `https://github.com/gpbl/react-day-picker.git`
- Tag/version: `v10.0.1`
- Commit: `6d3929d655779d178638d8f80171597a579468e8`
- License: MIT; retain the upstream notice with any adapted source.
- Runtime dependencies: `date-fns@^4.1.0` and `@date-fns/tz@^1.4.1`.

## Public surface contract

- Root exports from `packages/day-picker/src/index.ts`, including `DayPicker`, `useDayPicker`, calendar/date classes, helpers, formatters, labels, utilities, UI enums, and public types.
- `./locale` and `./locale/*` mappings.
- `./style.css`, `./style.module.css`, and documented compatibility stylesheet paths.
- `./package.json` metadata export.
- Custom component overrides use Octane component descriptors while keeping upstream prop names and observable behavior.

## Implementation sequence

1. Vendor the exact upstream package source, tests, license, and checksum manifest under `packages/day-picker/upstream/`.
2. Establish package metadata, workspace catalogs, changeset, binding status, CLI/website inventories, typecheck project, and export-surface tests.
3. Reuse framework-neutral date classes, helpers, formatters, labels, utilities, locales, and styles with only import-extension adaptations required by the workspace.
4. Port React hooks and context to Octane equivalents: controlled month/selection state, focus, navigation, range/multiple/single selection, and animation cleanup.
5. Port the component tree and `DayPicker` renderer to `.tsrx`, preserving semantic table/grid markup, ARIA labels, data attributes, keyboard behavior, and override points.
6. Adapt upstream runtime tests in bounded vertical slices: calculations first, then rendering/navigation, selection, focus/keyboard, accessibility, localization/time zones, custom components, animation, and regression cases.
7. Add SSR and real-browser lanes; compare high-value flows with a React oracle and register exact test identities in the repository parity harness.
8. Run simplification and formal code review, repair findings, execute repository-wide gates, then commit, push, open one PR, and babysit it through CI/review.

## Required parity evidence

- Pinned-source and license checksum audit.
- Root/subpath export inventory and type tests.
- Adapted full-lane inventories for DOM and SSR projects.
- React-vs-Octane oracle cases for default markup, navigation, single/multiple/range selection, disabled/hidden/outside days, dropdown captions, custom components, locale/time-zone behavior, and keyboard focus movement.
- Real-browser evidence for focus, keyboard navigation, month transitions, animation cleanup, and stylesheet-driven layout.
- Explicit divergences only where Octane's descriptor/event model cannot reproduce a React-specific implementation detail; no similar-but-different API substitutions.

## PR and tracker policy

- Branch: `jon/react-day-picker-binding`.
- Exactly one PR for this binding.
- Tracker states: Not started → In progress → In review → Complete and merged.
- Do not mark complete until the PR is merged and the package plus `status.json` exist on current Octane `main`.

## Exit criteria

- The documented public surface is import-compatible from the Octane package.
- Selection, navigation, focus, accessibility, locale, styling, and SSR contracts have executable coverage.
- Parity manifests and generated inventories pass repository checks.
- Package checks, global React parity audit, formatting, relevant typechecks/tests, and CI are green.
- PR review is drained or any genuinely human-only residual is recorded on its owning thread.
