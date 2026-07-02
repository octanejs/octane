---
"octane": patch
---

Effect drains are now re-entrancy-safe (React parity).

An effect body that synchronously dispatches a DISCRETE event (e.g. a hidden form
"bubble input" dispatching `click`) triggers a synchronous flush from the event
handler — which re-entered `drainPhase` over the same live queue, re-running
entries the outer walk had already executed. When the re-run effect re-dispatched,
the recursion was unbounded (a Radix Checkbox inside a `<form onChange>` exploded
to hundreds of change events and a stack overflow). Each drain now takes ownership
of its batch up-front (React nulls `rootWithPendingPassiveEffects` before running
effects — same idea): a re-entrant call sees only effects enqueued during the
drain, which it runs like React's nested passive flush.
