---
"octane": patch
"@octanejs/app-core": patch
"@octanejs/vite-plugin": patch
"@octanejs/rspack-plugin": patch
"@octanejs/rsbuild-plugin": patch
---

Promote scoped signals to a stable API. Detect signal capabilities automatically in the compiler and remove the experimental `nativeReads` build option. Signal handles and helpers keep their `$` naming convention; local hooks, inferred memos, async resources, and DOM SSR/hydration work through the standard toolchain. Add the signals website guide and llms.txt reference.
