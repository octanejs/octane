---
'octane': patch
---

A custom hook in an application `.ts` or `.js` module now gets a hook slot for every custom-hook call, even when the module never imports `octane`. Before, a hook composed only of other hooks, such as one calling a zustand store hook twice with different selectors, ran both calls in one hook instance. Their state and store subscriptions collided, so updates could be lost or loop until "Maximum update depth exceeded". Application modules are those under the Vite or Rspack root that share its `package.json`. Installed and nested workspace packages still opt in through an `octane` import or the `@jsxImportSource octane` pragma, and `requireDirective` still requires the pragma. `// octane-no-slot` still opts a module out.
