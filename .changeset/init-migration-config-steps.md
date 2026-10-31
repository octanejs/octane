---
'@octanejs/cli': patch
---

`octane init` turns off `rewriteRelativeImportExtensions` when the effective tsconfig enables it: TypeScript reports TS2876 for every relative `.tsrx` import it is asked to rewrite, and the bundler emits the app. For an existing bundler config it names the `@vitejs/plugin-react` call that `octane()` replaces, and, when the project has `.tsrx` files, tells a TanStack Router plugin to pass `enableRouteGeneration: false`, because its generator finds only `.ts`, `.tsx`, `.js`, and `.jsx` routes and would regenerate the route tree without them. In a Vite+ project whose config declares a `run.tasks` entry named like a script `init` would add, such as `typecheck`, it adds no script, which `vp run` would refuse beside the task, and names the command the task should run.
