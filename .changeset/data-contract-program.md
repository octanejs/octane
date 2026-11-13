---
'octane': minor
'@octanejs/rspack-plugin': minor
'@octanejs/vite-plugin': minor
'@octanejs/cli': minor
---

Add the whole-program `octane/data` contract check and the generated `octane/data/manifest`. Once an app imports `octane/data/manifest` (or sets `data: true` on the Vite or Rspack plugin), the build checks each module's contracts and reports contracts no `createDataHandler` serves, contracts served twice, names shared across `*.data.ts` modules, and unused contracts. The manifest exports `contracts`, `writes`, and `identity`. `octane analyze` runs the same checks, and `contractIdentity` is exported from `octane/data`.
