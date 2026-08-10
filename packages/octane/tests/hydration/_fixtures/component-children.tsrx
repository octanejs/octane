import { useState } from 'octane';

// SSR + hydration coverage for a host whose children are all component slots
// with @if-root bodies (single-host / single-component arms). The server frames
// every component range; the client must adopt those ranges byte-for-byte and
// stay interactive, and post-hydration updates must mount fresh client DOM
// (which uses the anchorless regime) inside the adopted tree.

function Leaf(props) @{
	<span class="leaf">{props.label as string}</span>
}

function Panel(props) @{
	const [n, setN] = useState(0);
	@if (props.big) {
		<div class="big" onClick={() => setN(n + 1)}>{props.label + ':' + n as string}</div>
	} @else {
		<Leaf label={props.label} />
	}
}

export function Pair(props) @{
	<section class="host">
		<Panel big={props.aBig} label="A" />
		<Panel big={props.bBig} label="B" />
	</section>
}

export function Tree(props) @{
	@if (props.depth > 0) {
		<div class="n">
			<Tree depth={props.depth - 1} path={props.path + 'L'} />
			<Tree depth={props.depth - 1} path={props.path + 'R'} />
		</div>
	} @else {
		<Leaf label={props.path} />
	}
}
