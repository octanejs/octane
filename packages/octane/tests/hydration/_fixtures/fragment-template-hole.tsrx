import { createElement, type OctaneNode } from 'octane';

// A renderable `{expr}` hole beside a sibling. Its value is text or a
// multi-root (fragment) template component, rendered directly or returned
// from a plain component. The server and client values can differ.

function Pair(props: { v: string }) @{
	<>
		<p class="x">{props.v}</p>
		<i>{props.v}</i>
	</>
}

function Other(props: { v: string }) @{
	<>
		<span>{props.v}</span>
		<em>{props.v}</em>
	</>
}

function OuterPair(props: { v: string }): OctaneNode {
	return createElement(Pair, { v: props.v });
}

function pick(kind: string, v: string): OctaneNode {
	return kind === 'pair'
		? createElement(Pair, { v })
		: kind === 'chain-pair'
			? createElement(OuterPair, { v })
			: kind === 'other'
				? createElement(Other, { v })
				: v;
}

export function Sib(props: { kind: string; v: string }) @{
	<section>
		{pick(props.kind, props.v)}
		<b>{props.v}</b>
	</section>
}
