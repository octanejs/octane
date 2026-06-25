// A component used at a `<Foo/>` site need not return JSX — it can return a
// primitive (coerced to text) or take an early return. "Component-ness" is the
// use-site, not the declaration; the renderable return-path coerces.
function Foo(props) {
	if (props.foo) return 123;
	return props.title;
}

export function App(props) @{
	<div>
		<Foo foo={props.foo} title={props.title} />
	</div>
}
