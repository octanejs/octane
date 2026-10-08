---
'octane': patch
---

Stop shipping inert profiling code from `vite dev` when profiling is off. Vite's dev server leaves `define` entries as runtime globals, so Octane's served runtime kept every `__OCTANE_PROFILE_ENABLED__` guard as a global read on its hot paths and still loaded `profiling.ts` and `devtools-hook.ts`. The Vite plugin now folds those guards out of Octane's own runtime modules in dev and gives Vite's dependency optimizer the same constant, so a pre-bundled `octane` drops them too. Profiling-on dev servers and production builds are unchanged.
