---
'@octanejs/shadcn': patch
---

The generated shadcn registry resolves sibling `workspace:*` specifiers to the
sibling's current version, so the install specs the upstream shadcn CLI reads
stay installable from npm. The registry is regenerated at release time, which
keeps those pins tracking the versions each release actually ships.
