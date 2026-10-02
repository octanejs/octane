import { useState } from 'octane';

function read(value: unknown): string {
	if (value !== undefined) throw value;
	return 'ok';
}

function Leaf(props: { value: unknown }) @{
	<i>{read(props.value) as string}</i>
}

function SiblingLeaf(props: { value: unknown }) @{
	<i>
		<u>{'x'}</u>
		{read(props.value) as string}
	</i>
}

// The server renders the `<b>` arm and the client the Leaf arm, so the Leaf's
// cloned `<i>` mismatches and is rebuilt on the client.
export function Branch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<Leaf value={undefined} />
		}
	</div>
}

export function SiblingBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<SiblingLeaf value={undefined} />
		}
	</div>
}

// A thenable `value` suspends the server Leaf, which then renders `@pending`.
export function TryBranch(props: { server?: boolean; value?: unknown }) @{
	<div>
		@try {
			@if (props.server) {
				<b class="server">{'server'}</b>
			} @else {
				<Leaf value={props.value} />
			}
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}

// The client's render-phase update switches to the Leaf arm while hydrating.
export function DrainBranch(props: { flip?: boolean }) @{
	const [server, setServer] = useState(true);
	if (props.flip && server) setServer(false);
	<div>
		@if (server) {
			<b class="server">{'server'}</b>
		} @else {
			<Leaf value={undefined} />
		}
	</div>
}

// Same tag, different text: a genuine server text mismatch.
export function Label(props: { text: string }) @{
	<div>
		<i>{props.text as string}</i>
	</div>
}
