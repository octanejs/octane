---
'octane': patch
'@octanejs/rspack-plugin': patch
'@octanejs/rsbuild-plugin': patch
---

Make Suspense waterfall elimination unconditional across the compiler and its
bundler integrations. Remove the `parallelUse` configuration flag so compiled
builds always run the conservative memoization, batched-unwrap, and eligible
descendant-warming analysis. The rspack plugin rejects the removed option
loudly; the vite plugin warns once that a passed `parallelUse` is ignored, so
the timing change is never silent on upgrade.
