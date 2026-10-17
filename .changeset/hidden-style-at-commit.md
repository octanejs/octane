---
'octane': patch
---

A style update to a host that `<Activity mode="hidden">` or a showing Suspense
fallback hides now reaches the host at its render's commit, under the hide,
instead of while the render runs. A render that never commits leaves the hidden
host untouched, and a reveal in the same render writes the new style once the
hide lifts. A style value that fails to coerce at that commit reaches the
nearest error boundary, as other commit-time binding errors do.
