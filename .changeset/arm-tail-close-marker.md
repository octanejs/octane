---
'octane': patch
---

Discard the server content left after a hydrated `@if` or `@switch` arm that ends with a `@try` whose body throws on the client. The boundary builds its catch arm and leaves the hydration cursor on its own close marker, so the server components the server's longer arm rendered after it stayed on screen with no report. Hydration now looks past that marker, removes them, and reports one structural `onRecoverableError`.
