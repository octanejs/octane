---
'octane': patch
---

Keep fallback collapsed-template handler updates linear in the number of native
event sites by matching accepted listeners within each host's ordered event
range. A 1,024-site update dropped from 2.4 ms to 0.5 ms while preserving host
identity, atomic handler publication, nullable listeners, and teardown behavior.
