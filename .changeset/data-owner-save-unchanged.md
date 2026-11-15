---
'octane': patch
---

Stop a tab that shares an `octane/data` owner from sending a read's value back to it to be saved. A read fetched in the data worker crossed to the page for validation and then crossed back in full, so the page paid for a second structured clone of it. Where the read's output validator returns the value it was given, the tab now tells the owner it validated and the owner saves its own copy. A validator that returns another representation still has that representation saved.
