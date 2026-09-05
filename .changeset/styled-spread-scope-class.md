---
'octane': patch
---

Keep a spread `class` when a styled host adds its scope hash.

A synthesized scope class now merges with a preceding spread's class instead of
replacing it, so `props.class` reaches the DOM on both client and SSR.
