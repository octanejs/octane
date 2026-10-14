---
'@octanejs/cli': patch
---

`octane analyze` no longer reads an `import` or `export` written inside a template literal or a comment, such as a code sample, as a real statement. A sample that mentions `octane/react` no longer counts as a ReactCompat boundary, and a module that mentions `octane` only in a sample no longer counts toward Strong coverage. `--strong-dependencies` also follows an import that a module only re-exports under another name, through `export const X = ns.Member`, `export { binding as X }`, or `export default binding`. It now reports the module that defines the component, not the entry that renames it.
