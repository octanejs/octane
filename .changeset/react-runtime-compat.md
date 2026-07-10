---
"octane": patch
"@octanejs/react-compat": patch
"@octanejs/vite-plugin": patch
---

Add a runtime compatibility path for unmodified, pre-compiled React packages.

`@octanejs/react-compat` now provides React hook dispatch, automatic JSX,
ReactDOM root/event/form adapters, an `octane({ compat: [react()] })` Vite extension,
external-store selector support,
class state/lifecycles and class Error Boundaries, SSR facades, explicit
unsupported-API diagnostics, and an `octane` export condition for native package
upgrades. Octane adds an opt-in WeakMap hook cursor used only by compatibility
components, Rules-of-Hooks validation, direct-Promise Suspense handling,
compat-scoped controlled DOM properties, and pure-host ref teardown without
adding compatibility fields to native scopes or changing compiled Octane hook
and uncontrolled-input semantics.
