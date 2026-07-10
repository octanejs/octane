# React-parity gaps (generated)

<!-- GENERATED FILE — do not edit. Regenerate with `pnpm parity:gaps`. -->

The **executable** parity backlog: every `it.fails(...)` pin under
`packages/octane/tests`. Each pin is a real, currently-failing divergence from
React — when the runtime is fixed the pin flips red in the suite and must be
converted to a plain `it`, and this index must be regenerated
(`pnpm parity:gaps`; CI runs `parity:gaps:check`).

`// GAP` comments in test files are NOT the backlog — many annotate
since-fixed behavior or intentional platform differences. Only the pins below
are live gaps.

**4 active pin(s).**

## packages/octane/tests/conformance/form-actions-extra.test.ts

- **activates for startTransition inside a preventDefault-ed submit (Per :2021/:2078)**
  - GAP: Per ReactDOMForm-test.js:2021/:2078 — React ACTIVATES useFormStatus when startTransition is called inside a preventDefault-ed submit event (the manual-action idiom). In octane, form status is published ONLY by the intercepted `<form action={fn}>` path (handleFormSubmit → setFormStatus in runtime.ts); a transition started during a submit event dispatch never reaches the form. Likely fix: handleFormSubmit-adjacent tracking — when a transition starts synchronously during a form's submit dispatch whose default was prevented, publish pending status to that form until it settles.

## packages/octane/tests/conformance/insertion-effect-order.test.ts

- **on unmount, destroys insertion effects before layout effects, and passive effects after the sync phase**
- **fires all insertion effects (interleaved) before firing any layout effects — update choreography**

## packages/octane/tests/conformance/ssr-server-semantics.test.ts

- **re-renders on render-phase updates until settled (Per :156/:171)**
  - GAP: React's server renderer processes RENDER-PHASE state updates — a `setCount` during render loops the component until it converges, so React serializes 'Count: 3' (Hooks :156/:171; same family: useReducer render-phase dispatch :234/:263). Octane's server useState returns a NOOP dispatch and a render is strictly single-pass, so it serializes the initial 'Count: 0'. Likely fix: a render-phase update loop in runtime.server.ts's useState/ useReducer + ssrComponent (re-invoke the body while dispatches fired).
