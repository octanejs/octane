---
'octane': minor
---

`write()` and `feed()` take a `version`, as `read()` does, and `contractIdentity` includes it. Change it when a deploy changes what a write's or a feed's schemas accept or return in a way their JSON Schema shape can't show, such as a transform: tabs of builds whose versions differ never share a data worker's owner, so an older worker never validates for a newer tab with its own schemas. A write's or feed's `version` affects nothing else.
