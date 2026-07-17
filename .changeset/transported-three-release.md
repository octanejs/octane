---
'octane': patch
'@octanejs/three': patch
---

Add asynchronous acknowledgement semantics to the experimental universal
renderer transport and complete the Three technical preview with verified
package exports, supported Three-version lanes, real WebGL failure recovery,
and renderer performance baselines. Compiler-proven keyed intrinsic leaf loops
now use an opt-in compact universal transaction, while the Three driver stages
and applies canonical retained mesh batches without cloning the full host tree.
The production-browser 1,000-mesh stability run now measures mount at 0.98x and
retained updates at 1.03x R3F, replacing the previous 3.66x and 15.55x gaps.
