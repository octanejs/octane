---
'octane': patch
---

`octane/testing`: each `installTestClock()` clock opens its own shared producer budget window. A window an earlier clock left open no longer makes a ready promise wait on a real timer after that clock was removed, which made tests that install a clock in `beforeEach` fail now and then on a loaded machine.
