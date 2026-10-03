---
'octane': patch
'@octanejs/vite-plugin': patch
---

The `hydrate: 'islands'` shell check now rejects more interactive shells and also runs in dev:

- A hook is recognized through an import alias (`useEffect as onMount`) and through a namespace or member call (`O.useState()`), and so is an aliased signal declaration.
- Every local function the shell references is checked, not only JSX tags: a component passed as a prop (`render={Item}`) and a helper called to render output. A relative import passed into JSX is checked when it can render (a function, or a component-named value), including a namespace member such as `UI.Button` and a module-level alias of a local function. Strings, asset URLs and other plain values, including any export of a non-Octane module, are not shell output. A package component or a module-level wrapper such as `memo(...)` passed as a value cannot be checked.
- A signal handle bound through a member (`{state.count$}`), an import alias (`count$ as live`) or a module-level alias (`const live = count$`) is reported.
- In dev, an islands-only route whose shell needs client work now logs a warning naming the module, line and problem, once per problem, while the page keeps serving. The production build still fails on it.
