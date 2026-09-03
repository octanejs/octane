---
'octane': patch
---

Recover server rendering throughput: a render whose hoisted head is empty no
longer scans the whole response for a `</head>` unless it is a document.
Rendered output is unchanged.
