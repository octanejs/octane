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
