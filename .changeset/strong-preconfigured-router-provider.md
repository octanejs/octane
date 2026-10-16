---
'@octanejs/tanstack-router': minor
'@octanejs/tanstack-start': patch
---

Add a Strong preconfigured provider for compiled routes and use it in compiled Start. Navigation acknowledgement now belongs to the mounted router and resolves only after the offered match tree commits. The existing provider continues to accept synchronous router option props.
