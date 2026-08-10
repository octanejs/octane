---
'octane': patch
'@octanejs/floating-ui': patch
'@octanejs/base-ui': patch
'@octanejs/radix': patch
---

Publish executable CommonJS conditions for Octane core, Floating UI, Base UI, and Radix while preserving their existing ESM and source-first entry points. Source-package discovery still recognizes those packages when the CommonJS build has not been generated yet.
