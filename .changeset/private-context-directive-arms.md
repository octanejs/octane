---
'octane': patch
---

A private Context provider inside an `@if`, `@for`, `@switch` or `@try` arm now compiles to the compiled provider, as one directly in the template already did. Before, a single such provider sent every provider of that Context through the public path, and an application paid for the generic child slot and host-element renderer it needs: about 35 KB gzip in a Strong signals app.
