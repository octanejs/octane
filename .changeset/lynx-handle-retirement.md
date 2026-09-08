---
'@octanejs/lynx': patch
---

Prepare exact compact-run acknowledgements by following the smaller of the
retired range and the materialized-handle set.

This keeps tiny retired runs independent of unrelated public handles without
making large, mostly unmaterialized compact ranges walk every logical id.
