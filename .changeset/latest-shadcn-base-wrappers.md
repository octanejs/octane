---
'@octanejs/shadcn': patch
'@octanejs/aria': patch
'@octanejs/base-ui': patch
'octane': patch
---

Update the shadcn registry baseline to 4.21.0 and adopt cn 0.2.6 across the Base UI, Radix, and React Aria bindings. Add Base UI Select, Navigation Menu, and Scroll Area wrappers using the release's Nova styles and Base UI 1.8.0 primitives.

Hoist and deduplicate Base UI's scrollbar stylesheet. Preserve global CSS rules in compiled Float style resources so selectors remain active instead of being removed by scoped-style pruning.

Update React Aria Components to 1.20.0, React Aria to 3.51.0, and React Stately to 3.49.0. Add TokenField and PreviewTrigger, keyboard shortcut handling, context menus, and the coordinated accessibility and localization fixes.
