---
'octane': patch
---

In development, a hook called while no Octane component is rendering now throws an error that names the likely causes, instead of `TypeError: Cannot read properties of null (reading 'hooks')`. The common cause inside a component is a second copy of Octane in the bundle, which can happen even when both copies have the same version, for example when pnpm installs one version once per set of peer dependencies. The error says that `createRoot` or `hydrateRoot`, the hook, and `octane/internal/client` must resolve to the same `octane` package. Production builds are unchanged.
