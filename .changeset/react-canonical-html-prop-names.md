---
'octane': patch
---

Stop warning in development about React's canonical camelCase HTML prop names
such as `colSpan`, `rowSpan`, `dateTime`, `hrefLang`, `useMap`, `accessKey`,
and `popoverTarget`. These names were missing from the host-property
diagnostics table, so they were reported as unrecognized props even though they
render correctly on the client and the server. Their native lowercase spellings
(`colspan`, `rowspan`, ...) remain accepted without a warning, and a miscased
spelling such as `COLSPAN` now suggests the canonical name.
