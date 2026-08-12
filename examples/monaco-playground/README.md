# Monaco Playground

Consumer example for [`@octanejs/monaco-editor`](../../packages/monaco-editor).

**Default path:** npm-packaged `monaco-editor@0.55.1` (workspace catalog pin) bundled
with Vite. `src/monaco-env.ts` sets `MonacoEnvironment.getWorker` via
`monaco-editor/esm/vs/.../*.worker?worker` imports (0.55 exports map) and calls
`loader.config({ monaco })` so the binding, loader, and editor package versions
are exercised together by typecheck, production build, and e2e.

CDN AMD `loader.config({ paths: { vs } })` is documented as an alternate in the
package README — this example does not use it.

```bash
pnpm --filter monaco-playground-example dev
pnpm --filter monaco-playground-example test:e2e
```
