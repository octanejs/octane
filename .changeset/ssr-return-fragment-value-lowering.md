---
'octane': patch
---

SSR: a return-JSX component returning a FRAGMENT (`function Doc() { return <>…</>; }`) now serializes hydration-compatibly. The client value-lowers the returned fragment to a descriptor array mounted by the return-slot `childSlot` — one slot range plus one `<!--[-->…<!--]-->` block per item (text items included) — but the server's template walk concatenated the children with markerless text separators and no slot range, so `hydrateRoot` silently rebuilt (duplicated) the content instead of adopting it. The server compiler now routes value-position returned fragments through `ssrChild([...])` over the same descriptor array, making server output byte-adoptable by the client. Single-element returns, `@{}` template bodies, and value holes are unchanged.
