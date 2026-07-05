---
'octane': patch
---

React 19 custom-element listener semantics: a function-valued lowercase `on*` prop on a custom element (`<my-el oncustomevent={fn}>`) now attaches a real event listener for the name after `on` (verbatim), with identity swaps re-attaching and null detaching — and the function never lands in the markup. This is platform-aligned, not synthetic emulation: custom elements dispatch arbitrary events and this is the only declarative way to hear them. The property-vs-attribute heuristic remains intentionally unsupported (plain attributes, per octane's pass-through policy).
