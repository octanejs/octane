---
"octane": patch
---

Adopt React's `dangerouslySetInnerHTML={{ __html: … }}` for raw HTML, and stop
special-casing the `innerHTML` attribute.

Raw HTML is now set the React way: `<div dangerouslySetInnerHTML={{ __html: markup }} />`.
The compiler extracts `__html` and uses the existing innerHTML-assignment fast
path (markerless, only-child) on both the client and the server (SSR emits the raw
content). Spreads are handled on both sides too — `<div {...props} dangerouslySetInnerHTML={{ __html }} />`
and a spread that itself carries `dangerouslySetInnerHTML` (the client reads
`.__html` via the spread/property path; SSR binds each spread once and renders its
`__html` as the element's content, last-source-wins).

**Breaking:** the bare `innerHTML={expr}` attribute is no longer treated as raw
HTML — like React, it's now just an ordinary (inert) attribute. Replace
`innerHTML={markup}` with `dangerouslySetInnerHTML={{ __html: markup }}`. (The
`.tsrx` `{html expr}` child directive is unaffected.)
