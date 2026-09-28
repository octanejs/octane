---
'octane': patch
---

JSX returned by a direct call of a named `function` declaration now resolves its non-literal props and children where the value renders, the same as JSX returned by an arrow function or method. Previously such a call read context and other values during the call, and the server rendered the value to HTML immediately, so a server-rendered fragment root or `.map()` row could disagree with the client. Rendering the same function as a component (`<Row />`) is unchanged.
