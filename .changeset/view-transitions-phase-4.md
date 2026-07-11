---
'octane': patch
---

View Transitions phase 4: parent enter/exit relays (React's
`enableViewTransitionParentEnterExit` — on in the experimental channel where
ViewTransition ships). New boundary props `parentEnter`/`parentExit` (class
values, per-type maps supported) + `onParentEnter`/`onParentExit` callbacks: a
nested boundary inside a subtree that entered/exited as one unit now activates
its parent relay when every strict intermediate boundary also relays (declares
the relay prop or handler and doesn't resolve `'none'`) and the unit's
outermost boundary genuinely enters/exits — not `'none'`, not consumed by a
shared-element pair. Plain DOM between boundaries never breaks the chain;
handler-only boundaries participate; a `'none'` relay class stops the chain
below it. All 25 in-scope ReactDOMViewTransition tests are now ported and
passing.
