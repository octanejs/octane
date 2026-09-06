---
'octane': patch
'@octanejs/testing-library': patch
'@octanejs/base-ui': patch
'@octanejs/base-ui-utils': patch
---

Require Octane 0.2.5 or newer for testing-library and the Base UI 1.8 binding.
Published 0.2.4 does not export `isInActScope`. Restore the root `useMediaQuery`
export and keep its options argument optional.
