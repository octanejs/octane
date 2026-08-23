---
'octane': patch
'@octanejs/recharts': patch
'@octanejs/visx': patch
'@octanejs/remix-router': patch
---

Fix strict browser TypeScript consumption of source-published chart bindings.

Recharts now publishes authored TypeScript for its chart utilities and state,
resolves component imports explicitly, and exports the component implementations'
own prop types. Visx supports strict browser source checks without Node globals.
Remix Router's published declarations retain native anchor and form ref types.

Fix deferred native chart events, keep imperative and Cell refs off unrelated
hosts, and resolve missing radial geometry without dropping data rows.

Octane accepts optional refs in composed ref arrays and supports nested ref arrays
in `useImperativeHandle`, including callback cleanup and primitive handles. Require
the published TSRX compiler fix for ref-and-spread expressions rather than relying
on a workspace-only patch.
