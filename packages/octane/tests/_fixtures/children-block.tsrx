import { isChildrenBlock } from 'octane';

// A function-as-child consumer, like React-ecosystem render-prop APIs. It must tell a real
// render-prop child (`<Consumer>{(data) => …}</Consumer>`, called with data) apart from ordinary
// element/text children (`<Consumer><span/></Consumer>`, rendered as-is). octane passes the former
// RAW and compiles the latter to a `markChildrenBlock`-tagged render fn, so `isChildrenBlock`
// excludes it.
function Consumer(props) {
	const c = props.children;
	const resolved =
		typeof c === 'function' && !isChildrenBlock(c) ? c({ name: 'payload' }) : c;
	return <div class="wrap">{resolved}</div>;
}

// Element child → rendered as-is (NOT called).
export function ElementChildren() @{
	<Consumer>
		<span class="el">hi</span>
	</Consumer>
}

// Text child → rendered as-is.
export function TextChildren() @{
	<Consumer>plain</Consumer>
}

// Render-prop child → called with `{ name: 'payload' }`.
export function RenderPropChildren() @{
	<Consumer>
		{(data) => <span class="rp">{data.name as string}</span>}
	</Consumer>
}
