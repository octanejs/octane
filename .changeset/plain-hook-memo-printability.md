---
'octane': patch
---

Production client builds now lower `useMemo` and `useCallback` inline in plain `.ts`/`.js` hook modules that contain template literals, `switch` statements, `try`/`catch`, default or namespace imports, import attributes, or method overloads. Before, any of that syntax kept the whole module on the slower callback-allocating path.

A plain hook module also stays on that path, with its source unchanged, when the inline printer would emit different code. That covers `declare global`, an empty `import type {}`, a cast assignment target such as `(ref.current as any) = value`, a non-null assertion that continues an optional chain such as `box?.item!.label`, and a few TypeScript-only forms. Previously, such a module could fail to build, turn the type-only import into a side-effect import, throw where the optional chain should short-circuit, or lose authored types.
