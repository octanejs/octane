---
'octane': patch
---

Float resource elements (`<link rel="stylesheet" precedence>`,
`<style href precedence>` and `<script async src>`) now reach `document.head`
when their render commits, as React DOM's do, instead of while it renders. A
render that never commits, or an arm that fails, inserts none of them. As in
React, a stylesheet resource the document lacks starts loading while it
renders, through a `<link rel="preload" as="style">`. Resource hints
(`preload`, `preinit`, `preinitModule`, `preloadModule`, `preconnect` and
`prefetchDNS`) are unchanged and insert when called.
