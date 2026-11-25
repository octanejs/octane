---
'octane': patch
---

`octane/data`: the data worker validates the values it restores from the account's cache, and a tab adopts them without validating them again. A value one tab offers the others, such as one a server render seeded, is taken as that tab's schema made it, so an output schema that transforms its input (text into a `Date`, say) no longer refuses the other tab's offer.
