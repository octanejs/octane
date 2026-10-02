import { use } from 'octane';

function label(): string {
	return 'ok';
}

function Leaf() @{
	<i>{label() as string}</i>
}

function Em() @{
	<em>{'e'}</em>
}

function Para() @{
	<p>{'p'}</p>
}

function Reader(props: { value: Promise<string> }) @{
	<s>{use(props.value) as string}</s>
}

function ReaderLeaf(props: { value: Promise<string> }) @{
	<i>
		<Reader value={props.value} />
		{label() as string}
	</i>
}

function UseEm(props: { value: Promise<string> }) @{
	<em>{use(props.value) as string}</em>
}

// Each Branch renders `<b>` on the server where the client renders a Leaf, so
// the Leaf's cloned `<i>` mismatches and is rebuilt on the client.

// The server `<em>` after the `<b>` is the client's own Em, which adopts it.
export function SiblingBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<Em />
			</>
		} @else {
			<>
				<Leaf />
				<Em />
			</>
		}
	</div>
}

// Nothing on the client claims the server `<s>` after the `<b>`.
export function TailBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<s class="server">{'f'}</s>
			</>
		} @else {
			<Leaf />
		}
	</div>
}

// The server `<p>` after the `<b>` is no component's output, but the client's
// Para adopts it as its root.
export function AdoptedTailBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<p>{'p'}</p>
			</>
		} @else {
			<>
				<Leaf />
				<Para />
			</>
		}
	</div>
}

// Both arms end with the same renderable hole, which the client adopts.
export function HoleBranch(props: { server?: boolean; text: string }) @{
	<div>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				{props.text}
			</>
		} @else {
			<>
				<Leaf />
				{props.text}
			</>
		}
	</div>
}

// The server rendered no @switch range at all, so the switch mounts its arm
// where the `<b>` stood.
export function SwitchBranch(props: { server?: boolean; k: string }) @{
	<div>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			@switch (props.k) {
				@case 'a': {
					<Leaf />
				}
				@default: {
					<u>{'z'}</u>
				}
			}
		}
	</div>
}

export function SwitchSiblingBranch(props: { server?: boolean; k: string }) @{
	<div>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<Em />
			</>
		} @else {
			<>
				@switch (props.k) {
					@case 'a': {
						<Leaf />
					}
					@default: {
						<u>{'z'}</u>
					}
				}
				<Em />
			</>
		}
	</div>
}

// The server's only seed belongs to its UseEm. The rebuilt leaf's Reader has
// none, so it suspends the boundary while the UseEm adopts its server `<em>`.
export function SeedBranch(props: {
	server?: boolean;
	leaf: Promise<string>;
	sibling: Promise<string>;
}) @{
	<div>
		@try {
			@if (props.server) {
				<>
					<b class="server">{'server'}</b>
					<UseEm value={props.sibling} />
				</>
			} @else {
				<>
					<ReaderLeaf value={props.leaf} />
					<UseEm value={props.sibling} />
				</>
			}
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}
