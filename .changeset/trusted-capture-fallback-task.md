---
'octane': patch
---

Fix controlled `value`/`checked` edits being reverted before their handlers ran whenever an `onXxxCapture` handler for the same event type was registered anywhere in the app. The browser runs a microtask checkpoint after every listener of an event it dispatches itself, so the capture segment's stopped-propagation fallback fired between the root's capture listener and its bubble listener and snapped every typed character back to the rendered value. Trusted events now close that window with a task, after native propagation has finished; script-dispatched events keep the microtask fallback.
