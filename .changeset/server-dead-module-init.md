---
'octane': patch
---

Drop unused module-load work from server and universal renderer bundles. The
server runtime built its ASCII async-identity table in a top-level loop, and
froze a shared empty snapshot list with `Object.freeze`. Bundlers cannot prove
either one free of side effects, so every server bundle kept both, including a
bundle that only escapes HTML. The universal renderer core had the same problem
with five frozen constants such as its `useFormStatus` result.

The table is now built by a pure-annotated `Array.from`, and the frozen
constants are marked pure, so bundlers remove them when nothing reads them. A
bundle that encodes async identities still builds the table once at load, and
encoding is unchanged. The smallest server bundle shrinks from 571 to 477 bytes
raw. A universal root that never calls `useFormStatus` shrinks by 65 bytes raw.
