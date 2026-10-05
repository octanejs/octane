---
'octane': patch
---

Resume a `query$` on hydration when the server reads it only from a function the declaring body created, such as a render prop another component renders. The server now streams that query under the component that declared it, as the component's own read would. Previously the browser loaded the query again, or threw "The streamed signal selection bootstrap is missing or incompatible" when the page streamed no other query. A handle passed as a value, such as a prop, is still read in the receiving component's own instance.
