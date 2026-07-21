// JSX tags whose RUNTIME value is a host tag STRING — the MDX shape
// (`<_components.h1>` reading off a components mapping whose defaults are
// strings). Two positions with different lowerings:
//   - VALUE position (.tsx return): the client lowers the tag to a
//     `createElement(obj.tag, …)` descriptor (de-opt host path); the server's
//     `ssrComponent` routes the string to the host serializer in the same
//     single-block shape, so hydration adopts identically either way.
//   - TEMPLATE position (`@{ … }` body): the tag lowers to componentSlot; the
//     runtime renders the string comp as a host element with the compiled
//     children render-fn INLINED as its content (no nested block), matching
//     the server's `<!--[--><tag>…</tag><!--]-->` emission.

// ── value position ───────────────────────────────────────────────────────────

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

// ── template position ────────────────────────────────────────────────────────

export function Card(props) @{
	<div id="card">
		<props.parts.title id="t" class={props.klass}>{props.text as string}</props.parts.title>
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
