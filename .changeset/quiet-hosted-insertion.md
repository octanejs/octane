---
'octane': patch
---

Skip pending Octane insertion effect setups when an earlier callback synchronously deletes their React host. The running callback's cleanup still runs, and insertion effects remain connected during Activity hide.
