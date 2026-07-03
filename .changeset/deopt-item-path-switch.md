---
"octane": patch
---

An unkeyed `{cond ? <Comp/> : null}` in a de-opt children array now unmounts cleanly.

`deoptItemBody` assumed one item scope "either always holds Blocks or never does" —
but an unkeyed conditional sits at a stable index key and flips between the Blocks
path (component) and the pure path (null/text/host). The pure path never tore down
the Blocks residue: the toggled-off component's DOM and live effects stayed in the
item range forever. Each path now tears down the other's residue on a switch, firing
unmount cleanups and clearing DOM (and the reverse pure→component direction clears
the stale raw node).
