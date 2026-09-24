---
'octane': patch
---

Upgrade `@tsrx/oxc` to 0.16.0 so `oxlint` parses a project's `.oxlintrc.json` with the project's own Oxlint when that one is newer than the vendored pin. A rule added to Oxlint after the pin is no longer rejected as unknown.
