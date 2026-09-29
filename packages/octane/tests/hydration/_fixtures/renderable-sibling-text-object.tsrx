// A renderable `{expr}` hole beside other children, whose server value was text
// but whose client value is an element, a list, or a portal. The server frames
// the hole's bare text in a `<!--[-->…<!--]-->` range, which none of those
// values can adopt, so hydration must discard it.
import { Fragment, Hydrate, createElement, createPortal, use, type OctaneNode } from 'octane';
import type { HydrationStrategy } from 'octane/hydration';

type Kind =
	| 'text'
	| 'p'
	| 'keyed'
	| 'list'
	| 'fragment'
	| 'portal'
	| 'returned'
	| 'returned-list'
	| 'returned-text';

interface HoleProps {
	kind: Kind;
	v: string;
	tail: string;
	target?: Element;
}

// Components that return their value rather than render a template.
function Returned(props: { v: string }): OctaneNode {
	return createElement('p', { class: 'x' }, props.v);
}

function ReturnedList(props: { v: string }): OctaneNode {
	return [createElement('p', { key: 'a', class: 'x' }, props.v), props.v];
}

function ReturnedText(props: { v: string }): OctaneNode {
	return props.v;
}

function pick(kind: Kind, v: string, target: Element | undefined): OctaneNode {
	switch (kind) {
		case 'p':
			return createElement('p', { class: 'x' }, v);
		case 'keyed':
			return createElement('p', { key: 'k', class: 'x' }, v);
		case 'list':
			return [createElement('p', { key: 'a', class: 'x' }, v), v];
		case 'fragment':
			return createElement(Fragment, null, createElement('p', { class: 'x' }, v));
		case 'portal':
			return createPortal(createElement('p', { class: 'x' }, v), target!);
		case 'returned':
			return createElement(Returned, { v });
		case 'returned-list':
			return createElement(ReturnedList, { v });
		case 'returned-text':
			return createElement(ReturnedText, { v });
		default:
			return v;
	}
}

// The trailing host hydrates after the hole, so it fails if the hole's recovery
// gives up on the rest of the root.
export function Hole(props: HoleProps) @{
	<section>
		{pick(props.kind, props.v, props.target)}
		<b>{props.tail as string}</b>
	</section>
}

export function NestedHole(props: HoleProps) @{
	<main>
		<Hole kind={props.kind} v={props.v} tail={props.tail} target={props.target} />
	</main>
}

// The hole is part of the root component's own output.
export function RootHole(props: HoleProps) @{
	<>
		{pick(props.kind, props.v, props.target)}
		<b>{props.tail as string}</b>
	</>
}

export function DormantHole(props: HoleProps & { when: HydrationStrategy }) @{
	<main>
		<Hydrate when={props.when} split={false}>
			<section>
				{pick(props.kind, props.v, props.target)}
				<b>{props.tail as string}</b>
			</section>
		</Hydrate>
	</main>
}

function Waits(props: { text: Promise<string> }) @{
	<em class="waits">{use(props.text)}</em>
}

function waitList(text: Promise<string> | null, v: string): OctaneNode {
	return text === null
		? v
		: [createElement('p', { key: 'a', class: 'x' }, v), createElement(Waits, { key: 'w', text })];
}

// A list item that suspends leaves the boundary to retry hydration later.
export function SuspendingHole(props: { text: Promise<string> | null; v: string }) @{
	<main>
		@try {
			<section>
				{waitList(props.text, props.v)}
				<b>{props.v}</b>
			</section>
		} @pending {
			<i>loading</i>
		}
	</main>
}
