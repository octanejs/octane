---
"@octanejs/rspack-plugin": patch
---

Skip unchanged imported pure components in Rspack production builds, as Vite production builds already do. Each importer is rebuilt with the compiler memo proofs its imported modules published, so a parent reuses an imported child's output while the child's props and proofs are unchanged. Imports without a proof keep their plain calls.
