# Lucide React → Octane port (`@octanejs/lucide`)

This binding tracks the published **`lucide-react@1.24.0`** package. It keeps
Lucide's component API and SVG output while replacing React renderer details
with Octane's `createElement`, context, hooks, refs, and server runtime.

## Scope

The initial port includes the full runtime surface:

- every canonical icon, compatibility alias, and the `icons` namespace;
- root and `@octanejs/lucide/icons/*` imports;
- `Icon`, `createLucideIcon`, `LucideProvider`, and `useLucideContext`;
- `DynamicIcon`, `iconNames`, and `dynamicIconImports` through the `dynamic`
  and `dynamicIconImports` subpaths;
- size, color, stroke width, absolute stroke width, classes, custom children,
  accessibility attributes, native events, and refs;
- client rendering, server rendering, and hydration.

## Architecture

Lucide publishes framework-neutral node data in `@lucide/icons`. The generator
reads that data together with the pinned `lucide-react` export maps and creates
small local component wrappers. It also reproduces React's compatibility aliases
and dynamic import name map. Geometry stays owned by Lucide, and consumers retain
per-icon code splitting and tree shaking.

The hand-authored runtime mirrors Lucide React's layers:

1. `Icon` applies provider defaults, SVG defaults, accessibility behavior, and
   icon-node children.
2. `createLucideIcon` adds stable icon-specific class names.
3. generated icon files bind a name to framework-neutral node data.
4. `DynamicIcon` resolves the generated import map and renders through `Icon`.

## Intentional renderer adaptations

- React `forwardRef` is represented by Octane's normal `ref` prop.
- Hand-authored hook calls use stable explicit Octane slots.
- Events are native DOM events, matching Octane's event model.

## Evidence and maintenance

- generation fails when the generated files drift from the pinned upstream
  export, alias, or dynamic import surfaces;
- export-shape tests compare root, namespace, and dynamic names with the real
  `lucide-react@1.24.0` package;
- differential fixtures render the same `.tsrx` source through Octane Lucide and
  Lucide React and compare normalized SVG DOM;
- focused tests cover accessibility, refs, custom nodes, dynamic loading,
  tree-shaking, SSR, and hydration.

To update Lucide, change both catalog versions, run `pnpm install`, then run
`pnpm lucide:generate`. Review upstream runtime changes before accepting the
generated diff, and refresh the version and evidence date in this document and
`packages/lucide/status.json`.
