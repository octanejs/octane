---
'octane': patch
---

Make production hydration template-free on the happy adoption path. Prod now
validates an adoption root by nodeType + tag only, answered straight off the
template's source string, so adopting server DOM never parses the template
(parsing happens only on mismatch recovery and client-side mounts). Tag-level
and text-level mismatches still detect and recover in production; same-tag
branches differing only in static attributes are no longer detected there
(React parity — dev keeps the full deep validation and warns + rebuilds).
