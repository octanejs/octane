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

**3 active pin(s).**

## packages/octane/tests/conformance/insertion-effect-order.test.ts

- **on unmount, destroys insertion effects before layout effects, and passive effects after the sync phase**
- **fires all insertion effects (interleaved) before firing any layout effects — update choreography**

## packages/octane/tests/conformance/ssr-serialization.test.ts

- **hydrates component hierarchies byte-stably (Per :657/:677)**
  - GAP: hydrating nested `{children}` component chains is not byte-stable — at depth >= 2 the SERVER collapses the children-fn block and the nested component's block into ONE `<!--[-->…<!--]-->` range, while the client layers a childSlot AND a componentSlot; the inner componentSlot finds no second range to adopt and mints fresh `<!--comp-->` markers. Elements, text, and warnings are all clean (see the content-level assertions above) — only the marker topology diverges. Fix needs the client componentSlot to BORROW its childSlot's adopted markers when the server emitted a single collapsed range (or the server to stop collapsing).
