---
'octane': patch
---

Children and `dangerouslySetInnerHTML` on void elements (`<input>`, `<br>`, `<img>`, …) are now rejected instead of failing silently (React parity — React throws "`input` is a void element tag and must neither have `children` nor use `dangerouslySetInnerHTML`"):

- **Compile-time diagnostic** (client, server, and value-position `createElement` lowering): `<input>{'kid'}</input>` and `<input dangerouslySetInnerHTML={…}/>` now fail the compile with a source-located error. Previously the template parser silently dropped the children out of the emitted `<input>…</input>` markup, and the `htmlOnlyChild` fast path wrote invisible `input.innerHTML`.
- **Runtime throw** on the routes the compiler can't see: a spread (`<input {...props}/>`) or de-opt (`createElement('input', {dangerouslySetInnerHTML})`) descriptor carrying `dangerouslySetInnerHTML` onto a void host now throws from `setAttribute`'s danger arm.
