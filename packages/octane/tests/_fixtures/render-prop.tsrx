// React-style render-prop children: a component takes a function child and
// CALLS it with data, rendering whatever descriptor it returns. The arrow body
// is bare JSX (`(data) => <span/>`), which the compiler lowers to a
// `createElement(...)` descriptor while preserving the arrow as a callable.

// Consumer that invokes its render-prop child with a value.
function Provide(props) @{
	const value = 'hi';
	<div class="wrap">{props.children(value)}</div>
}

// Bare-JSX arrow render-prop returning a host element with an attribute and a
// nested text hole.
export function App() @{
	<Provide>
		{(v) => <span class="rendered" data-tag="x">{v as string}</span>}
	</Provide>
}

// Fragment arrow body — `(v) => <>…</>`. Lowers to an array of descriptors that
// the de-opt childSlot flattens, matching a React fragment render-prop.
export function AppFrag() @{
	<Provide>
		{(v) => <>
			<span class="rendered">{v as string}</span>
			<b class="extra">!</b>
		</>}
	</Provide>
}
