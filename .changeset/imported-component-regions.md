---
"octane": patch
---

Skip unchanged imported pure components in Vite production builds. A parent now reuses an imported child's output when the child's module published a compiler memo proof and the child's props, the live imports its subtree reads, and the proofs of the imported components it renders are unchanged, matching what same-module components already do. Imports without a proof keep their plain calls.
