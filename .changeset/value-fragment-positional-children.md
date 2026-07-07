---
'octane': patch
---

Value-position JSX fragments (`return <>…</>` in `.tsx` bodies — and every MDX document root compiled through `@octanejs/mdx`) no longer trip the de-opt missing-key warning. The compiler now lowers a fragment's children through the new `positionalChildren([...])` tier-2 runtime export, marking the array as FIXED siblings (React's "static children" — `jsxs` — which React never key-warns) so the de-opt list keys it by index silently. This also covers interleaved text items (MDX's `"\n"` separators), which can never carry a key. Runtime-built arrays (unkeyed `.map()` results, arrays through props) keep the warning.
