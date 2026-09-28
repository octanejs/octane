---
'octane': patch
---

Node now loads a build that reads `process.env.NODE_ENV` once per module instead of at every development check. ESM imports get it through a new `node` export condition, and `require()` gets it through the CommonJS build. Unbundled server rendering is faster, and deleting the `process` global after import no longer turns framework errors into `ReferenceError: process is not defined`. Set `NODE_ENV` before the first Octane import in Node. Browser bundles are unchanged.
