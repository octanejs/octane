---
'@octanejs/testing-library': patch
---

`@testing-library/dom` is now a peer dependency (`^10.4.1`), as it is for `@testing-library/react`, so `configure()`, `screen`, and the queries share the test setup's DOM Testing Library instead of a second copy installed by the binding. Install `@testing-library/dom` next to `@octanejs/testing-library` if your project does not already have it.
