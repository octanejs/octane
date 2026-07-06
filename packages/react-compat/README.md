# @octanejs/react-compat (POC)

A **deterministic, non-AI** source-level bridger that detects React↔Octane
differences by static analysis and auto-applies the mechanical fixes, leaving
only the semantic residual to the MCP. It answers the question: _how much of
"install a React package and use it as-is" can we do without an agent?_

> **Scope.** This bridges React **source** (first-party, monorepo, untranspiled
> libraries, or the vanilla-core + thin-binding split). It does **not** run
> already-compiled npm packages: those ship `jsx()` calls + slotless
> `useState()`, and Octane slots hooks in its **compiler over source**, not at
> runtime (see `docs/react-library-compat-plan.md`). That's the wall, by design.

## Why it's viable, and where it stops

Three facts about Octane shape the whole thing:

1. **Hooks are slotted by compiler call-site, not call order.** A builtin hook
   call auto-injects `import { useState } from 'octane'` (`compile.js:2580`),
   which collides with a package's own `import { useState } from 'react'`. The
   one required mechanical fix is reconciling that import.
2. **The compiler slots by hook _name_, regardless of import source**
   (`compile.js:2576`), so React source that calls `useState(0)` gets slotted
   for free once Octane compiles the `.tsx`.
3. **Everything else React re-homes to a runtime shim** — `forwardRef` →
   refs-as-props, `useDebugValue` → no-op, `react-dom` → `octane`. So the
   codemod collapses to _import reconciliation only_ (no body rewriting).

What can't be shimmed (controlled inputs, class components, synthetic events,
react internals) is **flagged, never silently passed**, and routed to the MCP.

## The three layers

| Layer | File | Role |
|-------|------|------|
| **Shim** | `src/shim.ts`, `src/dom.ts`, `src/jsx-runtime.ts` | the `react` / `react-dom` a bridged package resolves to; absorbs the shimmable divergences at runtime |
| **Codemod** | `src/codemod.mjs` | flat, extensible `transforms[]` — reconciles imports so Octane's compiler owns the hooks |
| **Detector** | `src/detect.mjs` | flat, extensible `rules[]` + the `REACT_API_MAP`/`HOOK_NAMES` surface diff; classifies `bridgeable → needs-rework` and emits the MCP work-list |

Both registries are **single-source-of-truth**: they import `REACT_API_MAP`
from the MCP (`octane-mcp-server/src/bridge.js`) and `HOOK_NAMES` from the
compiler, so they can't drift from what the runtime actually supports. Adding a
capability = pushing one object onto `rules` or `transforms`.

## Graduated examples — easy → the wall

| # | `examples/…` | React APIs | Verdict | Proves |
|---|-------------|-----------|---------|--------|
| E1 | `e1-counter.tsx` | `useState` | `bridgeable-autofix` | pure-logic hook runs on Octane |
| E2 | `e2-context.tsx` | `createContext`/`useContext`/`useReducer`/`useEffect`/`useRef`/`useMemo` | `bridgeable-autofix` | context propagation + reducer + memo |
| E3 | `e3-store.tsx` | `useSyncExternalStore`/`memo`/custom hook/`useDebugValue` | `bridgeable-autofix` | external-store binding (the zustand shape) |
| E4 | `e4-hard.tsx` | `forwardRef` + controlled `<input>` + class component | `needs-rework` | **the wall**: block class, flag controlled input, autofix `forwardRef` |
| E5 | `e5-portal.tsx` | `createPortal` (react-dom) + `useState` | `bridgeable-autofix` | `react-dom` → octane re-home; portal into a host |
| E6 | `e6-imperative.tsx` | `forwardRef` + `useImperativeHandle` + `useState` | `bridgeable-autofix` | the forwardRef shim works at runtime (ref-as-prop → imperative handle) |
| E7 | `e7-suspense.tsx` | `Suspense` + `use(promise)` | `bridgeable-autofix` | async throw-to-suspend + reveal |
| E8 | `e8-store-app.tsx` | `createContext`/`useReducer`/`useContext`/`useMemo`/`useCallback` + keyed `.map` | `bridgeable-autofix` | composed reducer-store app + keyed-list reconciler |

`tests/run.test.ts` bridges E1–E3 and E5–E8 (unmodified React source → codemod →
Octane compiler → mount) and asserts they render and update; it also pins the
detector classification for the whole set. E4 is analyzed only (it's the wall).

`tests/differential.test.ts` is the **parity oracle**: it mounts each example
twice from the same source — the bridged version on Octane and the *original* on
**real React** (esbuild's automatic runtime) — drives an identical event
sequence, and asserts **byte-equal** `innerHTML` at every step (normalised the
same way as the repo's own differential rig). So these aren't just "it renders" —
they're "it renders *what React renders*", including the keyed list, the portal
host, the imperative handle, and the Suspense fallback→reveal.

## Run it

```bash
# static report + codemod preview for any React source
node packages/react-compat/bin/bridge.mjs packages/react-compat/examples/*.tsx

# the end-to-end proof (bridge → compile → mount on Octane)
./node_modules/.bin/vitest run --project react-compat
```

## Honest limits

- Regex over import statements, not a real AST — fine for a POC (imports have a
  fixed grammar); a production version swaps each `apply`/`detect` body for
  ts-morph node-matching, same registry shape.
- Static analysis can't prove behavioural equivalence. The oracle for that is
  the differential rig + the library's own test suite (both already in-repo).
- **Compiler bug found while building E5** (`@tsrx/core` parser, upstream of
  octane). It throws `Unexpected token` on the exact JSX shape Prettier emits: a
  child-hole **conditional** whose **parenthesized multi-line** branch contains a
  **non-self-closing child element on its own line** (depth ≥ 2). Any single
  change — inner self-closing, inner text, inner on the same line, depth-1,
  single-line branch, or no parens — parses fine. Minimal runnable repro:
  `node packages/react-compat/known-issues/tsrx-conditional-jsx-parse.mjs`. This
  is a real hazard (Prettier produces it), and warrants an upstream parser fix.
