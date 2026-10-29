---
'@octanejs/codemod': patch
---

A React package with no Octane binding now stays on React instead of failing
every module that imports it. A component of that package whose element gives
React only text and data renders in a `ReactCompat` island when the project has
React and React DOM 19.2 or newer, and a comment above each import says the
package has no port. Its hooks, contexts, and components that take Octane
children or render callbacks are reported where they are used, and the CLI
lists every such package under **No Octane port**, with the modules that import
it, the elements hosted in islands, and the uses that need a port. In
`--json` output, `missing` lists those packages as objects rather than names.

`useSyncExternalStore` imported from `use-sync-external-store` or its `/shim`
entry, React's version for React 17 and earlier, now comes from Octane.
