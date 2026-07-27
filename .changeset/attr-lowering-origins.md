---
'octane': patch
---

`compile({ inspect: true })` now claims an authored attribute NAME for the
tokens that name the call the attribute lowered to, so navigation tooling can
resolve a dynamic attribute in both directions.

A static attribute is baked into template markup and the template's origins
already carried it. A dynamic one has no markup at all — `<form action={fn}>`
survives as `setFormAction(el, 'action', …)` / `ssrAttr("action", …)`, and
`<input defaultValue={v}/>` as `setDefaultValueUncontrolled(el, v)`, which has
no name token whatsoever — and every other token of those calls maps to the
value expression. The authored name was therefore unreachable from the output:
the helper is a different word and the name literal carries quotes, so neither
reproduces the authored text a consumer accepts on an inferred attribution.

Covers both emitters and every attribute that routes to a helper rather than to
baked HTML: form actions, controlled and uncontrolled form props, `class`,
`style`, `autoFocus`, boolean, ARIA, `data-*`, and the generic attribute path.

Inspection-gated as before — the emitted module is byte-identical with and
without `inspect`.
