---
'octane': minor
---

`octane/data` creates can take IDs the server assigns: `write({ creates, serverId: (record) => record.id })`. Until the reply names the ID, the new record shows under its operation ID, and writes to it wait; the store then sends them with the server's ID. Writes that wait on a refused create are refused without being sent, and `settle(operationId, true, record)` names the ID after a receipt lookup. `entity()` takes the name of its ID property instead of a getter. Every read a write's reply carries is adopted, and every affected view recomputed, before any reader is notified, so no render sees part of one server transaction.
