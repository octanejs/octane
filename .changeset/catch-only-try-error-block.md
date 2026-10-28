---
'octane': patch
---

Compile a `@try` without `@pending` to the same catch-only boundary as `<ErrorBoundary>`, so an app whose boundaries only catch errors no longer ships the Suspense runtime and root render rollback (about 10 kB gzip on the weather benchmark's migrated React port). Like `<ErrorBoundary>`, such a boundary passes suspension to an enclosing one, and in a bundle with no entry that can suspend, a thenable thrown during render is an ordinary render error. When an `<ErrorBoundary>` or catch-only `@try` body throws during an update, none of the work its render queued, such as attribute writes, new elements or stylesheet resources, reaches the page any more.
