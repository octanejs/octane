---
'octane': patch
---

Define the inline-script content contract around static raw bodies and dynamic
`dangerouslySetInnerHTML` values. Preserve authored static script characters,
keep dynamic client and server output inside one script element, and hydrate the
server-safe script spelling without a false mismatch.
