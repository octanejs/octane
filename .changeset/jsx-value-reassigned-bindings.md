---
'octane': patch
---

Read a reassigned variable's value from when a JSX value was built, matching
React. Octane renders the non-literal children and props of a JSX value later,
so a variable assigned again in between showed its later value: a counter
incremented in a `.map` callback rendered its final value in every row, and
`content = <Frame>{content}</Frame>` nested the wrapper inside itself until the
stack overflowed. The compiler now captures such variables when the JSX
evaluates, on the client and the server, so hydration agrees. Event handlers and
other functions inside the JSX still read the variable's current value. JSX a
module-level function declaration returns when called directly still reads at
render, as documented in `docs/differences-from-react.md`.
