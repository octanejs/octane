---
'octane': patch
---

Strong mode now rejects imperative writes to DOM that the template renders.
When a `useRef` provably names exactly one intrinsic element in the same
component, writing `textContent`, `innerText`, or the child list of an element
with rendered children, or changing its class, a template-set attribute, or a
template-set `style` property, reports `OCTANE_STRONG_MANAGED_DOM_WRITE`. Writing
`innerHTML`, `outerHTML`, `insertAdjacentHTML()`, or `setHTMLUnsafe()` to a
rendered element reports `OCTANE_STRONG_RAW_HTML_WRITE`; use
`dangerouslySetInnerHTML={trustHTML(html)}` instead. Refs passed to components or
helpers, reassigned refs, and writes to DOM the template does not own stay valid.
Compatibility mode and emitted code are unchanged.
