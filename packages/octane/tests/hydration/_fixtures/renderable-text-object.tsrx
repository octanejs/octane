// A renderable `{expr}` hole that is its host's only child, whose server value
// was text but whose client value is an element, a component, or a list. The
// server serializes the text as the host's bare, unframed text, which none of
// those values can adopt, so hydration must discard it.
import { Hydrate, createElement, use, type OctaneNode } from 'octane';
import type { HydrationStrategy } from 'octane/hydration';

type Kind = 'text' | 'p' | 'inner' | 'list' | 'empty';

interface HoleProps {
	kind: Kind;
	v: string;
	tail: OctaneNode;
}

function Inner(props: { label: string }) @{
	<em class="inner">{props.label}</em>
}

function pick(kind: Kind, v: string): OctaneNode {
	switch (kind) {
		case 'p':
			return createElement('p', { class: 'x' }, v);
		case 'inner':
			return createElement(Inner, { label: v });
		case 'list':
			return [createElement('p', { key: 'a', class: 'x' }, v), v];
		case 'empty':
			return null;
		default:
			return v;
	}
}

// The trailing hole hydrates after the first, so it fails if the first one's
// recovery gives up on the rest of the root.
export function Hole(props: HoleProps) @{
	<section>
		<div>{pick(props.kind, props.v)}</div>
		<b>{props.tail}</b>
	</section>
}

export function NestedHole(props: HoleProps) @{
	<main>
		<Hole kind={props.kind} v={props.v} tail={props.tail} />
	</main>
}

// A textarea's children are its default value, so an element there is
// rejected on both sides.
export function AreaHole(props: HoleProps) @{
	<section>
		<textarea>{pick(props.kind, props.v)}</textarea>
		<b>{props.tail}</b>
	</section>
}

function Waits(props: { text: Promise<string> }) @{
	<em class="waits">{use(props.text)}</em>
}

function wait(text: Promise<string> | null, v: string): OctaneNode {
	return text === null ? v : createElement(Waits, { text });
}

// A value that suspends leaves what it built for the boundary's next attempt.
export function SuspendingHole(props: { text: Promise<string> | null; v: string }) @{
	<main>
		@try {
			<section>
				<div>{wait(props.text, props.v)}</div>
				<b>{props.v}</b>
			</section>
		} @pending {
			<i>loading</i>
		}
	</main>
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
