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
// the Leaf's `<i>` does not match the server HTML.

// The server `<em>` after the `<b>` is the client's own Em.
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
// Para renders the same element.
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

// Both arms end with the same renderable hole.
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

// The server rendered no @switch range at all.
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

function Inner() @{
	<s>{'s'}</s>
}

// The client's @switch arm renders the same `<u>` as the server's arm, but
// the server rendered no @switch range around it.
export function SwitchAdoptedHostBranch(props: { server?: boolean; k: string }) @{
	<div>
		@if (props.server) {
			<>
				<u>
					<Inner />
				</u>
				<Em />
			</>
		} @else {
			<>
				@switch (props.k) {
					@case 'a': {
						<u>
							<Inner />
						</u>
					}
					@default: {
						<b>{'d'}</b>
					}
				}
				<Em />
			</>
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

// The server's only seed belongs to its UseEm. The mismatched leaf sits inside
// the @try arm, so only the arm renders on the client.
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
