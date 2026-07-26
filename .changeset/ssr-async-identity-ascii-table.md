---
'octane': patch
---

Speed up the server's async-identity string encoding. Identity scopes encode each
UTF-16 code unit at a fixed width so lone surrogates stay injective, but the
encoder built every unit with `toString(16).padStart(4, '0')` — two throwaway
string allocations per character, which showed up as roughly 15% of render time
on descriptor-heavy SSR (the shape `@octanejs/*` bindings produce). Identity keys
are overwhelmingly ASCII, so those units now come from a prebuilt table and only
the rare non-ASCII unit takes the formatting path.

The emitted encoding is unchanged: verified byte-identical across all 65536 code
units, lone surrogates, and fuzzed inputs.
