---
'octane': patch
---

Guard `hot.data` in the universal webpack-HMR handoff: webpack and rspack leave `module.hot.data` undefined until a previous instance of the module has disposed, so the emitted `hot.data.__octaneUniversalComponents` read crashed every dev bundle on its first evaluation.
