---
'octane': patch
---

Load the browser's own query selection when hydration finds a server result for a
different request. When a component's props or state select a query request
other than the one the server resolved under the same owner, hydration no longer
fails with "The presented query definition does not match". The query loads its
current selection as if the server had not seeded it, and adoption keeps the
server's nodes while reporting changed text as a recoverable hydration mismatch.
