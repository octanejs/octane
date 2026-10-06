// Roots without a Suspense boundary whose client render differs from the
// server's `server` render, then suspends at GateLeaf while `gate.thrown`
// holds a promise.
import { createElement, type OctaneNode } from 'octane';

function read(value: unknown): string {
	if (value !== undefined) throw value;
	return 'ok';
}

export const gate: { thrown?: unknown } = {};

function GateLeaf() @{
	<i>{read(gate.thrown) as string}</i>
}

function ClientMark() @{
	<s>{'client'}</s>
}

export function RootBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<GateLeaf />
		}
	</div>
}

export function RootForm(props: { server?: boolean }) @{
	<div>
		<input class="draft" />
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<>
				<ClientMark />
				<GateLeaf />
			</>
		}
	</div>
}

// A resolved arm adopts with its own hydration capability and commits before
// the root suspends after it.
export function RootNestedArm(props: { server?: boolean }) @{
	<div>
		@try {
			@if (props.server) {
				<b class="server">{'server'}</b>
			} @else {
				<ClientMark />
			}
		} @pending {
			<p>{'pending'}</p>
		}
		<GateLeaf />
	</div>
}

function hole(server: boolean | undefined): OctaneNode {
	return server ? 'server' : createElement('p', { class: 'x' }, createElement(GateLeaf));
}

// The renderable hole discards the server text and builds <p> before suspending.
export function RootHole(props: { server?: boolean }) @{
	<section>
		{hole(props.server)}
		<b>{'tail'}</b>
	</section>
}

function only(server: boolean | undefined): OctaneNode {
	return server ? 'server' : createElement('b', null, 'client');
}

// The only-child hole discards its host's server text.
export function RootOnlyChild(props: { server?: boolean }) @{
	<div>
		<p>{only(props.server)}</p>
		<GateLeaf />
	</div>
}

// The server rendered fewer items than the client.
export function RootFewerItems(props: { server?: boolean }) @{
	<ul>
		@for (const item of props.server ? ['a'] : ['a', 'b']; key item) {
			<li>{item}</li>
		}
		<GateLeaf />
	</ul>
}

// The server rendered the list's @empty arm.
export function RootEmptyList(props: { server?: boolean }) @{
	<ul>
		@for (const item of props.server ? [] : ['a']; key item) {
			<li>{item}</li>
		} @empty {
			<p>{'none'}</p>
		}
		<GateLeaf />
	</ul>
}

// Reading a module `let` keeps the call lite in a production compile.
let label = 'client';

function LiteLabel() @{
	<p>{label as string}</p>
}

// The lite call renders into the arm's <section>, its lite host, and discards
// the server's <u> there before the root suspends.
export function RootLiteHost(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<section>
				<ClientMark />
				<u class="server">{'server'}</u>
				<hr />
			</section>
		} @else {
			<section>
				<ClientMark />
				<LiteLabel />
				<hr />
			</section>
		}
		<GateLeaf />
	</div>
}

// Rendered into a <body> container, beside a document resource that the
// root's fallback keeps.
export function RootBody(props: { server?: boolean }) @{
	<main>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<GateLeaf />
		}
	</main>
}

// Rendered into an <html> container, whose text differs on the client before
// the root reaches GateLeaf.
export function RootHtml(props: { server?: boolean }) @{
	<>
		<head>
			<meta name="side" content="root" />
		</head>
		<body>
			<p>{(props.server ? 'server' : 'client') as string}</p>
			<GateLeaf />
		</body>
	</>
}

// A whole document whose body differs on the client.
export function RootDocument(props: { server?: boolean }) @{
	<html>
		<head></head>
		<body>
			@if (props.server) {
				<b class="server">{'server'}</b>
			} @else {
				<GateLeaf />
			}
		</body>
	</html>
}
