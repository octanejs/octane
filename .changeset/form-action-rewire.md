---
"octane": patch
---

`<form action>` toggling function → string → function re-wires submit interception.

Switching a form's action from a function to a string cleared the intercepting
`$$submit` handler but left the wired-once guard set, so flipping back to a function
action skipped the re-wire and submit interception was permanently dead for that
form. The guard is now reset alongside the handler.
