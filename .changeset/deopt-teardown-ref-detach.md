---
"octane": patch
---

Host-element ref lifecycle now matches React's commit phasing across all paths.

- De-opt host refs (object and callback `ref`s on `createElement`/value-position
  JSX) are detached when their subtree is torn down: keyed-list item removal,
  full list clears (including the `batchClearItems` fast path), wholesale scope
  unmount of a pure `hostNode` or `hostElementBody` element, and mode-switch
  rebuilds. Previously `ref.current` kept pointing at the removed DOM node and
  callback refs never received their `null`/cleanup call.
- All ref detaches — teardown and identity swaps, compiled templates, spreads,
  fragment refs, and the de-opt paths alike — are deferred to commit and drain
  before that commit's ref attaches (React's mutation→layout phasing). A ref
  hopping between elements in one render no longer ends `null` when a later
  binding's detach ran after an earlier binding's attach, and a state setter
  used as a ref settles on the replacement element instead of oscillating.
- `useImperativeHandle` honors a callback ref's React-19 cleanup return: detach
  runs the returned cleanup instead of re-invoking the ref with `null`.
