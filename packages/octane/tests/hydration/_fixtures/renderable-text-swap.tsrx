// A renderable `{expr}` hole whose server value was an element, a component, or
// a list, but whose client value is text or empty. The hole's text/empty regime
// must discard the server content it cannot adopt.
import { Hydrate, createElement, type OctaneNode } from 'octane';
import type { HydrationStrategy } from 'octane/hydration';

type Kind = 'p' | 'inner' | 'textThenP' | 'list' | 'text' | 'undefined' | null;

interface HoleProps {
	kind: Kind;
	v: string;
	tail: string;
}

function Inner(props: { label: string }) @{
	<b class="inner">{props.label as string}</b>
}

// Serializes as `A<p class="x">A</p>` directly inside the hole's range, so a
// client text value adopts the leading server text node.
function TextThenP(props: { label: string }) @{
	<>
		{props.label as string}
		<p class="x">{props.label as string}</p>
	</>
}

function pick(kind: Kind, v: string): OctaneNode {
	switch (kind) {
		case 'p':
			return createElement('p', { class: 'x' }, v);
		case 'inner':
			return createElement(Inner, { label: v });
		case 'textThenP':
			return createElement(TextThenP, { label: v });
		case 'list':
			return [v, createElement('p', { class: 'x' }, v)];
		case 'text':
			return v;
		case 'undefined':
			return undefined;
		default:
			return null;
	}
}

// The hole is its host's only child.
export function Hole(props: HoleProps) @{
	<section>
		<div>{pick(props.kind, props.v)}</div>
		<i>{props.tail as string}</i>
	</section>
}

export function SiblingHole(props: HoleProps) @{
	<section>
		{pick(props.kind, props.v)}
		<i>{props.tail as string}</i>
	</section>
}

// The hole is the component's entire output, so it adopts the server range
// from the hydration cursor rather than from a template anchor.
function Sole(props: { kind: Kind; v: string }) @{
	<>{pick(props.kind, props.v)}</>
}

export function SoleHole(props: HoleProps) @{
	<section>
		<Sole kind={props.kind} v={props.v} />
		<i>{props.tail as string}</i>
	</section>
}

export function DormantHole(props: { when: HydrationStrategy; kind: Kind; v: string }) @{
	<main>
		<Hydrate when={props.when} split={false}>
			<section>
				<div>{pick(props.kind, props.v)}</div>
			</section>
		</Hydrate>
	</main>
}
