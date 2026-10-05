// A renderable `{expr}` hole beside other children, whose server value was text
// but whose client value is an element, a list, or a portal. The server frames
// the hole's bare text in a `<!--[-->…<!--]-->` range, which none of those
// values can adopt, so the server HTML does not match the client.
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
	| 'returned-text'
	| 'chain'
	| 'chain-list'
	| 'chain-text'
	| 'returned-template';

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

// Components that return another component's value. The middle return slot has
// no server range of its own, so the server text begins outside the range of
// the component whose return slot must discard it.
function ReturnedChain(props: { v: string }): OctaneNode {
	return createElement(Returned, { v: props.v });
}

function ReturnedListChain(props: { v: string }): OctaneNode {
	return createElement(ReturnedList, { v: props.v });
}

// Returns the server's text through another component, then swaps that
// component for an element once `v` changes.
function ReturnedTextChain(props: { v: string }): OctaneNode {
	return props.v === 'A'
		? createElement(ReturnedText, { v: props.v })
		: createElement(Returned, { v: props.v });
}

// A template component that is not single-root: it reports through its clone.
function Guarded(props: { v: string }) @{
	if (props.v === '') return null;
	<p class="guarded">{props.v}</p>
}

function ReturnedTemplate(props: { v: string }): OctaneNode {
	return createElement(Guarded, { v: props.v });
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
		case 'chain':
			return createElement(ReturnedChain, { v });
		case 'chain-list':
			return createElement(ReturnedListChain, { v });
		case 'chain-text':
			return createElement(ReturnedTextChain, { v });
		case 'returned-template':
			return createElement(ReturnedTemplate, { v });
		default:
			return v;
	}
}

// The trailing host follows the hole, so it shows whether the hole's owner fell
// back as a whole.
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

// Returns its value, text or an element, once `text` resolves.
function WaitsFor(props: { text: Promise<string>; v: string; element: boolean }): OctaneNode {
	use(props.text);
	return props.element ? createElement('p', { class: 'x' }, props.v) : props.v;
}

function WaitsForChain(props: { text: Promise<string>; v: string; element: boolean }): OctaneNode {
	return createElement(WaitsFor, props);
}

function waitChain(text: Promise<string> | null, v: string, element: boolean): OctaneNode {
	return text === null ? v : createElement(WaitsForChain, { text, v, element });
}

// A component in a chain that suspends leaves the boundary to retry hydration
// against the server DOM the first attempt left.
export function SuspendingChain(props: {
	text: Promise<string> | null;
	v: string;
	element: boolean;
}) @{
	<main>
		@try {
			<section>
				{waitChain(props.text, props.v, props.element)}
				<b>{props.v}</b>
			</section>
		} @pending {
			<i>loading</i>
		}
	</main>
}
