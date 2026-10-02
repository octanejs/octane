---
'octane': patch
---

Keep server text and attribute values in a resolved `@try` arm while its
hydration is suspended, and report their mismatches once when it commits. An
attempt that repaired a value and then suspended used to show the client value
in the server's markup before the arm hydrated, and the attempt that committed
found the value already matching, so a text mismatch never reached
`onRecoverableError` and development builds logged no warning. Attribute,
style, and `dangerouslySetInnerHTML` warnings now also wait for the committing
attempt instead of logging from an attempt that is thrown away.
