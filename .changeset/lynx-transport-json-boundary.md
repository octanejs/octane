---
'@octanejs/lynx': patch
---

The Lynx transport now owns encoding, so nothing live crosses a thread. Every
`ContextProxy` send site encodes and every receive site decodes, which means
the receiver is handed its own ordinary local data by construction rather than
a composite built on the other thread. On device that composite could arrive as
a `LEPUS_TAG_LEPUS_REF`, where reads and `Object.keys` work but `Reflect.ownKeys`
throws and `Object(v) !== v`; a string cannot be a host-backed reference on any
engine. The engine lifecycle entry — `__RenderPage`, `__UpdatePage`,
`__UpdateGlobalProps`, whose sender is the native engine and cannot be asked to
encode — is materialized on arrival through the same codec, so a malformed
engine record is one dropped record with a diagnostic naming the field instead
of a torn-down page lifetime.

The codec owns the value domain: `undefined` travels as a sentinel and comes
back as `undefined`, `__proto__` is an own data property on both sides of the
wire whatever the engine's `JSON.parse` does with it, and a `bigint`, non-finite
number, function, symbol, `Date`, `Map`, or class instance is refused at the
sender, which is the last place that still knows what the value was. A payload
that literally contains a sentinel round-trips unchanged, and a cyclic value is
named where it closed rather than exhausting the stack.

Wire payloads are unchanged to the byte: a clean message encodes as exactly its
own JSON inside a constant 4-byte envelope, measured across the lynx-table gates
at 1k and 10k rows (create at 10k: 341,647 B to 341,651 B).
