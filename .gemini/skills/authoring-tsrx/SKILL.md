---
name: authoring-tsrx
description: >-
  Write a new Octane component in .tsrx, or convert JSX to .tsrx. Use when
  creating a .tsrx file rather than editing one, because the path-scoped
  tsrx-authoring rule only fires once such a file is open.
---
# Authoring a new `.tsrx` file

Read `.rulesync/rules/tsrx-authoring.md` now. It is the full reference and the
single home for this content: components and the `@{ … }` form, when a text hole
needs `{expr as string}`, the native delegated event model, the `@if`/`@for`/
`@switch`/`@try` directive blocks, refs as props, and the typing rules.

That file is a path-scoped rule, so it loads by itself once you open an existing
`.tsrx` file. It does not fire when you are writing the first one, which is what
this skill exists to cover.

Then read a nearby `.tsrx` file for house style before writing.
