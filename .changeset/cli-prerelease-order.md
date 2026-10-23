---
"@octanejs/cli": patch
---

Compare prerelease version identifiers in SemVer order when checking dependency peer ranges, so doctor does not incorrectly reject versions such as `beta.10` against a `>=beta.2` minimum.
