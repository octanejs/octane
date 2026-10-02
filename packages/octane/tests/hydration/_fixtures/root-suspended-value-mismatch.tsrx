// Roots without a Suspense boundary whose first hydrating attempt repairs a
// server text, attribute, or style value and then suspends at GateLeaf while
// `gate.promise` is pending.
import { createElement, type OctaneNode } from 'octane';

function read(value: unknown): string {
	if (value !== undefined) throw value;
	return 'ok';
}

export const gate: { promise?: Promise<void> } = {};

function GateLeaf() @{
	<i>{read(gate.promise) as string}</i>
}

export function RootText(props: { label: string }) @{
	<div>
		<span>{props.label as string}</span>
		<GateLeaf />
	</div>
}

export function RootSiblingText(props: { label: string }) @{
	<div>
		<span>
			<u>{'x'}</u>
			{props.label as string}
		</span>
		<GateLeaf />
	</div>
}

export function RootAttribute(props: { label: string }) @{
	<div>
		<span title={props.label}>{'t'}</span>
		<GateLeaf />
	</div>
}

export function RootStyle(props: { label: string }) @{
	<div>
		<span style={{ color: props.label }}>{'t'}</span>
		<GateLeaf />
	</div>
}

export function RootStyleText(props: { label: string }) @{
	<div>
		<span style={`color: ${props.label}`}>{'t'}</span>
		<GateLeaf />
	</div>
}

export function RootStaticStyle(props: { label: string }) @{
	<div>
		<span style={{ display: 'block', color: props.label }}>{'t'}</span>
		<GateLeaf />
	</div>
}

export function RootClass(props: { label: string }) @{
	<div>
		<span class={props.label}>{'t'}</span>
		<GateLeaf />
	</div>
}

// Raw HTML keeps the server's content, so every attempt that compares it
// finds the mismatch.
export function RootHtml(props: { label: string }) @{
	<div>
		<span dangerouslySetInnerHTML={{ __html: props.label }} />
		<GateLeaf />
	</div>
}

// A resolved arm adopts with its own hydration capability and commits its
// repairs before the root suspends after it.
export function RootArmText(props: { label: string }) @{
	<div>
		@try {
			<span>{props.label as string}</span>
		} @pending {
			<b>{'pending'}</b>
		}
		<GateLeaf />
	</div>
}

export function RootArmClass(props: { label: string }) @{
	<div>
		@try {
			<span class={props.label}>{'t'}</span>
		} @pending {
			<b>{'pending'}</b>
		}
		<GateLeaf />
	</div>
}

export function RootArmStyle(props: { label: string }) @{
	<div>
		@try {
			<span style={{ color: props.label }}>{'t'}</span>
		} @pending {
			<b>{'pending'}</b>
		}
		<GateLeaf />
	</div>
}

// The client removes a namespaced attribute that the server rendered.
export function RootXlink(props: { label: string }) @{
	<div>
		<svg>
			<use xlinkHref={props.label === 'server' ? '#server' : undefined} />
		</svg>
		<GateLeaf />
	</div>
}

// The client changes a namespaced attribute that the server rendered.
export function RootXlinkValue(props: { label: string }) @{
	<div>
		<svg>
			<use xlinkHref={'#' + props.label} />
		</svg>
		<GateLeaf />
	</div>
}

// The server rendered the other @if arm, so hydration rebuilds the `<span>`
// from the client template before the root suspends.
export function RootRebuilt(props: { label: string }) @{
	<div>
		@if (props.label === 'server') {
			<b>{'server'}</b>
		} @else {
			<span title={props.label} style={{ color: props.label }}>
				{props.label as string}
			</span>
		}
		<GateLeaf />
	</div>
}

function Label(props: { text: string }) @{
	<span title={props.text} style={{ color: props.text }}>
		{props.text as string}
	</span>
}

function hole(label: string): OctaneNode {
	return label === 'server' ? 'server' : createElement(Label, { text: label });
}

// The renderable hole discards the server's text and clones Label's template
// before the root suspends.
export function RootHoleClone(props: { label: string }) @{
	<section>
		{hole(props.label)}
		<GateLeaf />
	</section>
}

function check(label: string): string {
	if (label !== 'server') throw new Error('client body failed');
	return label;
}

function Checked(props: { label: string }) @{
	<em>{check(props.label) as string}</em>
}

// The client's try body adopts the server's `<span>`, then throws to its catch
// arm, which replaces the body before the root suspends.
export function RootCaughtBody(props: { label: string }) @{
	<div>
		@try {
			<>
				<span title={props.label}>{'t'}</span>
				<Checked label={props.label} />
			</>
		} @catch (error: unknown) {
			<b>{'caught'}</b>
		}
		<GateLeaf />
	</div>
}
