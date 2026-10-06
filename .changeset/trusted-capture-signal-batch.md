---
'octane': patch
---

Fix controlled inputs losing user edits when an `onXxxCapture` handler for the same event writes a signal that the form reads. A signal write in a capture handler is meant to publish with the rest of the event's handlers. For an event the browser dispatched itself, such as a keystroke, a tap or a drag, it published in the microtask checkpoint between the root's capture and bubble listeners instead. The form then re-rendered its controlled `value` to the old state before `onInput` could read the edit, so a range stayed at its old value and typed characters were dropped. Trusted events now keep the capture write until the bubble handlers have run, or, when a native listener stops propagation below the root, until the browser has finished dispatching the event. Script-dispatched events are unchanged.
