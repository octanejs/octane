---
'@octanejs/rspeedy-plugin': patch
---

Add `@tsrx/oxc@0.20.0` to both Lynx toolchain lanes. The plugin compiles Octane
components in Node, and the compiler's parser is now an optional peer of
`octane`, so a Lynx project installs it alongside the rest of the lane.
