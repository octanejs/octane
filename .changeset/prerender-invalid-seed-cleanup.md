---
'octane': patch
---

Cancel injection producers when initial document seed validation fails during
`prerender()` or `prerenderToNodeStream()`, preserving the original validation
failure even if producer cleanup throws.
