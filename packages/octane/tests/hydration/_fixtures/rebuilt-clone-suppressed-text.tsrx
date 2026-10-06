function read(value: unknown): string {
	if (value !== undefined) throw value;
	return 'ok';
}

function Leaf(props: { value: unknown }) @{
	<i suppressHydrationWarning>{read(props.value) as string}</i>
}

function SiblingLeaf(props: { value: unknown }) @{
	<i suppressHydrationWarning>
		<u>{'x'}</u>
		{read(props.value) as string}
	</i>
}

function NestedLeaf(props: { value: unknown }) @{
	<i>
		<u suppressHydrationWarning>{read(props.value) as string}</u>
	</i>
}

function HoleLeaf(props: { value: unknown }) @{
	<i suppressHydrationWarning>{read(props.value)}</i>
}

// The server renders the `<b>` arm and the client the leaf arm, so the leaf's
// `<i>` does not match the server HTML.
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

export function NestedBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<NestedLeaf value={undefined} />
		}
	</div>
}

export function HoleBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<HoleLeaf value={undefined} />
		}
	</div>
}

// Same tag, different text: suppression keeps the server's text.
export function Label(props: { text: string }) @{
	<div>
		<i suppressHydrationWarning>{props.text as string}</i>
	</div>
}

export function SiblingLabel(props: { text: string }) @{
	<div>
		<i suppressHydrationWarning>
			<u>{'x'}</u>
			{props.text as string}
		</i>
	</div>
}
