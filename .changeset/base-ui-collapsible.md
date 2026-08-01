---
'@octanejs/base-ui': patch
---

Add `Collapsible` — Root, Trigger, and Panel, matching Base UI v1.6.0's anatomy.

Available as `@octanejs/base-ui/collapsible` and from the package root. This also lands the
`collapsibleOpenStateMapping` util, kept separate from the identically-named export in
`popupStateMapping` because upstream's two `triggerOpenStateMapping`s emit different attributes
(`data-panel-open` vs `data-popup-open`).

The port ships with `tests/upstream/collapsible.test.ts`: Base UI's own test file, assertions
unchanged, so behavioral drift fails the same case it would fail upstream.
