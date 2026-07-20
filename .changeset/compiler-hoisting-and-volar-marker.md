---
'octane': patch
---

Compiler: components referenced above their declaration (the canonical TanStack route-file shape — `createFileRoute(...)({ component: Home })` before `function Home() @{…}`) now compile to real hoisted function declarations instead of TDZ `const` bindings, in both client and server modes; capability stamps are emitted as `typeof`-guarded follow-up statements so route code-splitters that extract the declaration cannot strand them. Also restores the `compileToVolarMappings` sourceAst contract (`metadata.native_tsrx_body` on native template bodies) that TanStack's octane route-generator masker consumes — route-tree generation over `.tsrx` files works again without a committed `routeTree.gen.ts`.
