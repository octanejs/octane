---
'@octanejs/codemod': patch
---

Continue codemod previews past TSRX rename collisions. Report each conflicting source and preview the remaining files so partially migrated projects can see their remaining work. Write mode still stops before editing the project when a collision is found.

Convert JSX `&&` guards to `@if` when strict TypeScript types prove the condition can only be boolean or nullish.

Add `--no-project-types` for previews on large projects. The codemod uses module-local types and keeps compiler verification and import resolution.

Mark migrated files as blocked in the text report when the codemod found an error in their original source.

Preserve every-render React hook schedules when requesting Strong mode. Convert filtered array lists when the callback parameter names overlap safely.
