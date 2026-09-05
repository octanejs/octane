---
'octane': patch
---

Speed up production server rendering of elements with canonical attribute names
by avoiding redundant attribute aggregation while preserving spread precedence,
value coercion order, and rendered output.
