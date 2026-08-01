---
'octane': patch
---

Compile a `@{ … }` body that returns without reaching an output node.

A shorthand block whose statements return but which never reaches a trailing
JSX node crashed the client compiler with `Cannot read properties of undefined
(reading 'type')`:

```tsx
export function CoreGameFunction(props) @{
	const [boardData, setBoardData] = useState([null, null, null]);
	return null;
}
```

`@{ … }` desugars to a trailing return, so a body carrying any value return is
compiled as one whose output is a returned value rather than an emitted
template. That classification is driven by the returns alone, but lowering the
tail assumed the block also had a render node to lower, and the parser leaves
that node null when the block ends on a statement. The crash was not specific to
`useState` or to `null`: a block holding only `return <div />` failed the same
way, as did one holding only `return 1`. It was client-only — the server
compiler already treated the same shape as having an empty tail.

A block with no output node now compiles as what it is: the body's own returns
are the whole output, and falling off the end renders nothing. Setup still runs,
so slot-keyed hooks keep their state across whichever value the body returned.
This is the shape a component is in while it is being written, and the shape a
React-style `return <jsx>` inside a block already had.

The synthesized tail is dropped where it cannot be reached — when the block ends
in a `return` or a `throw`, or in an `if`/`else` whose arms both do. Reachability
is proven syntactically and nothing subtler is attempted, because keeping the
tail is always correct: a body that falls through to `undefined` is how a
compiled body reports that it already emitted its template.
