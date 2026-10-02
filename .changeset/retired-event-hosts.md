---
'octane': patch
---

Stop a focused host's removal from running handlers of components that already
unmounted.

Teardown disposes a component before it detaches the component's DOM, and
Chromium dispatches `focusout` synchronously while it removes a focused element.
That new event no longer starts handlers on hosts whose component has unmounted,
so a signal write from `onBlur` no longer reports `ScopeDisposedError` and a
plain `onBlur` no longer runs for an unmounted component. Still-mounted
ancestors and other roots still receive the event, and an event that was
already being dispatched when the component unmounted keeps its handlers until
it finishes. A ViewTransition deletion keeps its committed handlers live until
it publishes.
