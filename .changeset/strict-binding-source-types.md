---
'octane': patch
'@octanejs/recharts': patch
'@octanejs/visx': patch
'@octanejs/remix-router': patch
'@octanejs/redux-toolkit': patch
---

Fix strict browser TypeScript consumption of source-published chart bindings.

Recharts now publishes authored TypeScript for its chart utilities and state,
resolves component imports explicitly, and exports the component implementations'
own prop types. Visx supports strict browser source checks without Node globals.
Remix Router's published declarations retain native anchor and form ref types.
Redux Toolkit's query hooks type their bundler environment without Node globals.

Fix deferred native chart events, keep imperative and Cell refs off unrelated
hosts, and resolve missing radial geometry without dropping data rows.

Octane accepts optional refs in composed ref arrays and supports nested ref arrays
in `useImperativeHandle`, including callback cleanup and primitive handles. Require
the published TSRX compiler fix for ref-and-spread expressions rather than relying
on a workspace-only patch.

Publish the Volar compiler with its tested parser/printer dependencies and checked
public declarations, preventing newer transitive printers from corrupting typed
tuple parameters in installed consumers. Preserve generic Pie props and the
native group targets of polar-axis events.
