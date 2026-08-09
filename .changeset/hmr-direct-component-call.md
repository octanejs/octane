---
'octane': patch
---

Fix a dev-only crash ("Cannot read properties of undefined (reading 'block')") when a component is invoked as a plain function — for example `Row({ label })` inside another component's render or a `.map` callback. The HMR wrapper now stays transparent to scope-less direct calls, matching production behavior, and an edit still refreshes the call site's output through the caller's hot update.
