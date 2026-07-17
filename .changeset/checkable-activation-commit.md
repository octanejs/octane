---
'octane': patch
---

A synchronous commit during a controlled checkable's click dispatch (a handler
calling `flushSync` — press-state machinery does this) no longer reasserts the
stale controlled `checked` over the user's in-flight toggle. The platform
toggles a checkbox/radio before its click event and fires `input`/`change`
after it; reasserting in between reverted the toggle before any native handler
could read it. During that activation window the `checked` binding now uses
React's prop-diff semantics (an unchanged prop leaves the DOM drift for the
event-side restore; a prop that actually changed still writes), matching
React's observable behavior. The rejection contract is unchanged: an unheard
or rejected toggle still snaps back after the follow-up events.
