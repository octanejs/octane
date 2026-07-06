// Template-position JSX tags that resolve to a HOST tag STRING at runtime —
// a member expression (`<props.parts.title>`), a variable (`<Tag/>` with
// `const Tag = 'h1'`), or a string↔component flip. The compiler can't know the
// tag statically, so these lower to componentSlot; the runtime must render the
// string comp as a host element (client) / serialize it host-style (server).

export function Card(props) @{
	<div id="card">
		<props.parts.title id="t" class={props.klass}>
			{props.text as string}
		</props.parts.title>
	</div>
}

export function Counter(props) @{
	const [n, setN] = useState(0);
	<button id="counter" onClick={() => setN(n + 1)}>{`count:${n}`}</button>
}

// Variable tag wrapping a component child — the children render-fn must mount
// the component as a real Block inside the dynamic host element.
export function Wrap(props) @{
	const Tag = props.tag;
	<section id="wrap">
		<Tag id="inner">
			<Counter />
		</Tag>
	</section>
}

// Dynamic tag with events + ref on the tag itself.
export function Clicky(props) @{
	const Tag = props.tag;
	<div id="cl">
		<Tag id="btn" ref={props.tagRef} onClick={props.onPick}>{'pick'}</Tag>
	</div>
}

// Childless dynamic tag (void-element friendly on the server).
export function Bare(props) @{
	<div id="bare">
		<props.tag data-x="1" />
	</div>
}

// VALUE-position (.tsx return) member tags — the MDX shape (`<_components.h1>`
// reading off a components mapping whose defaults are strings). These lower to
// `createElement(obj.tag, …)` descriptors on the client (de-opt host path) and
// `ssrChild`/`ssrComponent` string handling on the server.
export function Doc(props) {
	return <>
		<props.components.h1 class="title">{props.title}</props.components.h1>
		<props.components.p>body text</props.components.p>
	</>;
}

// The same call site can resolve to a real COMPONENT at runtime (an MDX
// components-mapping override) — dispatch must stay dynamic on both sides.
function Fancy(props) {
	return <em class="fancy">{props.children}</em>;
}
export function Overridable(props) {
	const parts = { title: props.useFancy ? Fancy : 'h2' };
	return <parts.title>Title</parts.title>;
}
