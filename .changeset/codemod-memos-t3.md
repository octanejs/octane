---
'@octanejs/codemod': patch
'@octanejs/cli': patch
---

Fixes from migrating Memos and T3 Code:

- A text field that spreads a component's rest props (a shadcn-style `Input` or
  `Textarea`) takes `onChange` out of the rest and passes it as `onInput`, so
  controlled fields keep updating per keystroke. Before, the spread passed it
  through as Octane's native `change`, which fires on blur. A spread the codemod
  cannot prove safe is reported.
- `React.ReactNode`, `React.FC` and the other names of React's global namespace,
  written without an import, map to Octane's types.
- `forwardRef` type arguments are rewritten like any other type, so
  `React.ComponentPropsWithoutRef<"div">` no longer survives the migration.
- `e.target` becomes `e.currentTarget` in a handler a component passes on to a
  form control, as the project's types say (`<Input onChange={(e) => …}>`), in
  handlers annotated with a union of controls, and in `onFocus`/`onBlur`.
- Declaration files are migrated: `declare module 'react' { namespace JSX }`
  custom-element typing moves to `octane/jsx-runtime`, and other augmentations
  of React's types are reported.
- A package is reported as needing a binding only when the entry imported needs
  React: a package whose export map hides `package.json` is read from disk, and
  one with a `./react` entry or an optional React peer needs a binding only
  there.
- A component that reads its `children` as an element (`render={children}`,
  `cloneElement`, `Children.only`, `isValidElement`) is marked
  `descriptorChildren`, so its callers pass elements as React does, and its
  call sites in the module keep conditional children as expressions.
- Added imports use the module's own quote style.
- `@octanejs/cli` exports `readInstalled`, which reads an installed package's
  manifest without going through its export map.
