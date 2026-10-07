---
'octane': patch
---

On universal renderers (Lynx, Three, object), `export default (function Name() @{ … })`
no longer redeclares a module binding that shares the component's name. It also
no longer captures a read of `Name` that the module leaves unbound. The
component gets a fresh module binding and still hot-updates as `default`. Its
body still resolves `Name` to the component itself.
