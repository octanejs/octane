---
'octane': minor
---

A streamed Suspense boundary whose content has not arrived when hydration
reaches it now keeps the server's fallback until the stream swaps the content
in, as React leaves a pending dehydrated boundary, instead of rendering on the
client at once. The swap then hydrates the server's content, adopting its nodes
and `use()` seeds. An update that reaches the boundary first still renders it
on the client, and a boundary the stream marks errored (`$OCTRX`) renders on
the client and reports once through `onRecoverableError`. The stream's swap and
error scripts call a retry the client leaves on the boundary's open comment, so
deploy the server and the client from the same Octane version.
