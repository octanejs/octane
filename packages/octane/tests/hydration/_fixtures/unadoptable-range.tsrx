// Renderable values whose server range holds what they cannot adopt: nothing,
// text, or another element. Hydration discards it and builds the value on the
// client, including when the value suspends and its boundary retries over what
// the failed attempt left.
import { Fragment, Hydrate, createElement, use, type OctaneNode } from 'octane';
import type { HydrationStrategy } from 'octane/hydration';

type Kind =
	| 'empty'
	| 'text'
	| 'none'
	| 'list'
	| 'keyed'
	| 'fragment'
	| 'wait-list'
	| 'wait-p'
	| 'item-empty'
	| 'item-i'
	| 'item-p';

interface HoleProps {
	kind: Kind;
	v: string;
	// The value's component child waits for a pending `text`; null renders it now.
	text: Promise<string> | null;
}

function Waits(props: { text: Promise<string> }) @{
	<em class="waits">{use(props.text)}</em>
}

function Now(props: { v: string }) @{
	<em class="now">{props.v}</em>
}

function Nothing(): OctaneNode {
	return null;
}

function child(text: Promise<string> | null, v: string, key?: string): OctaneNode {
	return text === null ? createElement(Now, { key, v }) : createElement(Waits, { key, text });
}

function pick(kind: Kind, v: string, text: Promise<string> | null): OctaneNode {
	switch (kind) {
		case 'empty':
			return null;
		case 'none':
			return [null, false];
		case 'list':
			return [createElement('p', { key: 'a', class: 'x' }, v), v];
		case 'keyed':
			return createElement('p', { key: 'k', class: 'x' }, v);
		case 'fragment':
			return createElement(Fragment, null, createElement('p', { class: 'x' }, v));
		case 'wait-list':
			return [createElement('p', { key: 'a', class: 'x' }, v), child(text, v, 'w')];
		case 'wait-p':
			return createElement('p', { class: 'x' }, child(text, v));
		case 'item-empty':
			return [createElement(Nothing, { key: 'a' })];
		case 'item-i':
			return [createElement('i', { key: 'a', class: 'x' }, child(null, v))];
		case 'item-p':
			return [createElement('p', { key: 'a', class: 'x' }, child(text, v))];
		default:
			return v;
	}
}

function Returns(props: HoleProps): OctaneNode {
	return pick(props.kind, props.v, props.text);
}

// The trailing host hydrates after the value, so it fails if the recovery gives
// up on the rest of the root.
export function Hole(props: HoleProps) @{
	<section>
		{pick(props.kind, props.v, props.text)}
		<b>{props.v}</b>
	</section>
}

export function ReturnHole(props: HoleProps) @{
	<section>
		<Returns kind={props.kind} v={props.v} text={props.text} />
		<b>{props.v}</b>
	</section>
}

export function SuspendingHole(props: HoleProps) @{
	<main>
		@try {
			<Hole kind={props.kind} v={props.v} text={props.text} />
		} @pending {
			<i>loading</i>
		}
	</main>
}

export function SuspendingReturnHole(props: HoleProps) @{
	<main>
		@try {
			<ReturnHole kind={props.kind} v={props.v} text={props.text} />
		} @pending {
			<i>loading</i>
		}
	</main>
}

export function DormantHole(props: HoleProps & { when: HydrationStrategy }) @{
	<main>
		<Hydrate when={props.when} split={false}>
			<SuspendingHole kind={props.kind} v={props.v} text={props.text} />
		</Hydrate>
	</main>
}
