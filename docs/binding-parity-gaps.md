# Binding parity gaps (generated)

<!-- GENERATED FILE — do not edit. Regenerate with `pnpm binding-parity:gaps`. -->

This is the executable failure-pin backlog for every framework binding discovered
from the workspace inventory. It includes `it.fails(...)` and
`test.fails(...)` across JavaScript, TypeScript, TSX, and TSRX test files.

Zero pins means only that a package has no executable expected-failure marker;
it does **not** imply complete upstream parity. Consult
[`docs/bindings-status.md`](bindings-status.md) for each binding's supported
surface and evidence.

**8 active pin(s) across 18 binding package(s).**

| Package | Active pins |
| --- | ---: |
| `@octanejs/base-ui` | 0 |
| `@octanejs/floating-ui` | 0 |
| `@octanejs/hook-form` | 8 |
| `@octanejs/jotai` | 0 |
| `@octanejs/lexical` | 0 |
| `@octanejs/mdx` | 0 |
| `@octanejs/motion` | 0 |
| `@octanejs/radix` | 0 |
| `@octanejs/recharts` | 0 |
| `@octanejs/redux` | 0 |
| `@octanejs/remix-router` | 0 |
| `@octanejs/stylex` | 0 |
| `@octanejs/tanstack-query` | 0 |
| `@octanejs/tanstack-router` | 0 |
| `@octanejs/tanstack-table` | 0 |
| `@octanejs/tanstack-virtual` | 0 |
| `@octanejs/testing-library` | 0 |
| `@octanejs/zustand` | 0 |

## @octanejs/hook-form

### packages/hook-form/tests/upstream/useForm/reset.test.tsx

- **should update isMounted when isValid is subscribed**
  - GAP: octane re-renders App a third time. With isValid subscribed, the post-mount effect chain (useForm's mount + _setValid notification, then reset({})'s state.next) lands as two separate render passes in octane where React batches them into one — `mounted` records [false, false, true] (extra render with _state.mount already true) instead of [false, false]. Final state matches upstream (mount ends true); only the render count diverges.

### packages/hook-form/tests/upstream/useForm/resolver.test.tsx

- **should batch state updates when using trigger**
  - GAP: octane emits a third, duplicate state ({errors: test, isValidating: false} twice) — trigger()'s post-resolver notifications land as two separate render passes in octane where React's automatic batching coalesces them into one, so the tracker effect re-runs with a fresh (content-identical) errors reference. Same extra-render batching divergence as reset.test.tsx "should update isMounted when isValid is subscribed".

### packages/hook-form/tests/upstream/useForm/setValue.test.tsx

- **should validate the input and return correct isValid formState**
  - GAP: octane's async act() flushes work scheduled by the awaited body but does not park on a macrotask draining ALL in-flight microtask chains the way React's act does (flushWorkAndMicroTasks/enqueueTask). setValue's fire-and-forget shouldValidate chain emits state.next({ isValid: true }) a few microtasks after the body resolves; the re-render it schedules lands AFTER act returns, so result.current.formState.isValid still reads false. Repro: append one more `await act(async () => {})` and the assertion passes (internal control._formState.isValid is already true either way).

### packages/hook-form/tests/upstream/useWatch.test.tsx

- **should return defaultValue with shouldUnregister set to true and keepDefaultValues**
  - GAP: upstream fires an input event whose value equals the current value ('test' → 'test'). React's synthetic-event value tracker swallows that no-op event entirely (RHF's onChange never runs → 6 renders); octane events are native, so the `input` event is delivered, RHF notifies its values subscribers, and useWatch pushes one extra re-render (7 outputs). Intentional no-synthetic-events divergence, verified against react-hook-form under React 19.
- **should partial re-render**
  - GAP: after handleSubmit, RHF emits two state notifications in SEPARATE microtasks ({ errors: {} } before `await onValid`, then the final submitted state). React 18+ coalesces both into ONE committed render (render work is scheduled on a macrotask after the microtask queue drains), but octane's scheduler flushes per microtask (see packages/octane/tests/conformance/scheduling-triage.test.ts), so the parent commits 2 renders instead of 1 and `waitFor(parentCount === 1)` never observes 1.
- **should partial re-render with array name and exact option**
  - GAP: same microtask-flush divergence as 'should partial re-render' above — handleSubmit's two microtask-spaced notifications commit as 2 parent renders under octane where React coalesces them into 1.
- **should only update when value changed within compute**
  - GAP: on the first input ('' → '12') compute yields `false`, equal to the current useWatch state — React still re-enters the render phase once more before bailing out on an Object.is-equal setState (fiber double-buffering probe render), so upstream counts that phantom render (renderCount 4). Octane's eager bailout skips the extra parent-body run entirely (documented divergence, packages/octane/tests/conformance/eager-bailout.test.ts), so renderCount is 3. Verified against react-hook-form under React 19: distribution React [2 mount, 1 no-op input, 1 flip] vs octane [2, 0, 1].

### packages/hook-form/tests/upstream/watch.test.tsx

- **should partial re-render with array name and exact option**
  - GAP: after handleSubmit, RHF emits two state notifications in SEPARATE microtasks ({ errors: {} } before `await onValid`, then the final submitted state). React 18+ coalesces both into ONE committed render (render work is scheduled on a macrotask), but octane's scheduler flushes per microtask (see packages/octane/tests/conformance/scheduling-triage.test.ts), so the parent commits 2 renders instead of 1 and `waitFor(parentCount === 1)` never sees 1.
