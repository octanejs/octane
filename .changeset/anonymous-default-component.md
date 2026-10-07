---
'octane': patch
---

Compile `export default function () @{ … }`. An anonymous default-exported
`@{}` component used to crash the compiler with `Cannot read properties of null
(reading 'name')` in client, server, and HMR builds. It now compiles exactly like
a named default component. It server-renders, hydrates, hot-updates under its
`default` export, and specializes production roots that render it. The
compiler gives it a module binding that no authored identifier uses, so the
component's function name is `_default`, as in Babel's output. An `async` or
generator anonymous component is rejected with an error that names `default`.
