---
'octane': patch
---

Report a render loop driven by a component's own `derived$` or `query$` as a
"Maximum update depth exceeded" error instead of freezing the page.

A `derived$` or `query$` declared in a component body that captures a value the
body creates on every render, such as an inline object, runs again on every
render. If its result never compares equal, such as a new object, accepting each
render notified its readers, which rendered and declared it again. Those renders
started a fresh update each time, so the nested-update limit never applied:
`act()` reported that the scheduler did not stabilize, and outside `act()` the
page stopped responding with no error. Renders that a commit schedules through a
signal notification now count toward the update that caused them, so the cycle
fails with the update depth error, in production too. In development the message
names the component and the likely cause.

A redeclared result that equals the accepted one, the same error or a read still
waiting on the same pending dependencies, no longer notifies the cell's readers,
so a body that captures a new object while its query is pending or rejected now
settles instead of looping.
