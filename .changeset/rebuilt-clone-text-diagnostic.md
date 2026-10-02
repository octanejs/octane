---
'octane': patch
---

When hydration rebuilds an element whose server markup does not match, it now
reports only the structural mismatch. A text hole inside the rebuilt element
used to compare the client template's own placeholder as if it were server
text, so development builds logged a second, false "server rendered text"
mismatch for the same recovery. A text mismatch inside an element that
hydration adopts from the server still reports as before.
