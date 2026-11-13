---
'@octanejs/motion': patch
---

Keep cached `motion` and `m` host components stable when consumers assign or delete properties on the public proxies. Reading a host no longer creates a public property.
