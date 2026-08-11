---
'octane': patch
---

React Float style resources, and the Context.Consumer decision made concrete.

`<style href precedence>` rendered at a component's body root is now a React
Float STYLE RESOURCE: its plain CSS ships by href identity, sharing the
stylesheet dedupe namespace and precedence-group ordering with link resources
(`data-precedence`/`data-href` marked, SSR-emitted, hydration-deduped, retained
after unmount). Every other `<style>` keeps Octane's scoped-CSS behavior.
Octane emits one tag per resource (no same-precedence merging), and CSS
containing `</style` fails closed in SSR with a development diagnostic.

Context.Consumer stays modern-only, now with teeth: accessing `.Consumer` in
development logs a one-time migration diagnostic (and still returns
`undefined`, so feature probes match production), the upstream Consumer
scenarios protecting observable behavior are ported as `useContext`-reading
conformance tests, and the render-prop-surface-only cases are recorded as
parity-ledger non-goals.
