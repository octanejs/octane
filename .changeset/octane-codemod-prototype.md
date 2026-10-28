---
'@octanejs/codemod': minor
---

Add `@octanejs/codemod`, the `octane-codemod` command, which migrates a React +
TSX/JSX codebase to Octane + TSRX.

It rewrites React imports to `octane` and React libraries to their
`@octanejs/*` bindings, lowers components to `@{ … }` templates with `@if`,
`@for`, and `@try` where that keeps React's behavior, unwraps `forwardRef`,
ports context providers and consumers, legacy roots, and text-input `onChange`,
and renames template modules to `.tsrx`, updating every import of them. Every
migrated module is compiled before it is written. With `--strong` it applies the
compiler's own fixes and keeps each module Strong where the compiler accepts it,
falling back to compatibility mode with the remaining Strong errors reported.
What it cannot migrate, such as class components and React libraries without a
binding, is listed by file and line.
