function read(value: unknown): string {
	if (value !== undefined) throw value;
	return 'ok';
}

function AttrLeaf(props: { value: unknown }) @{
	<i
		title={read(props.value)}
		class={read(props.value)}
		style={{ color: read(props.value) === 'ok' ? 'red' : 'blue' }}
	>
		{'t'}
	</i>
}

function SuppressedLeaf(props: { value: unknown }) @{
	<i
		suppressHydrationWarning
		title={read(props.value)}
		class={read(props.value)}
		style={{ color: read(props.value) === 'ok' ? 'red' : 'blue' }}
	>
		{'t'}
	</i>
}

function NestedLeaf(props: { value: unknown }) @{
	<i>
		<u title={read(props.value)} class={read(props.value)} style={{ color: 'red' }}>
			{'t'}
		</u>
	</i>
}

function SpreadLeaf(props: { rest: Record<string, unknown> }) @{
	<i {...props.rest}>{'t'}</i>
}

// The server renders the `<b>` arm and the client the leaf arm, so the leaf's
// cloned `<i>` mismatches and is rebuilt on the client.
export function AttrBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<AttrLeaf value={undefined} />
		}
	</div>
}

export function SuppressedBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<SuppressedLeaf value={undefined} />
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

export function SpreadBranch(props: { server?: boolean; rest?: Record<string, unknown> }) @{
	<div>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<SpreadLeaf rest={props.rest!} />
		}
	</div>
}

// Same tag, different values: a genuine server attribute mismatch.
export function Attrs(props: { text: string; color: string }) @{
	<div>
		<i title={props.text} class={props.text} style={{ color: props.color }}>
			{'t'}
		</i>
	</div>
}

export function SuppressedAttrs(props: { text: string; color: string }) @{
	<div>
		<i
			suppressHydrationWarning
			title={props.text}
			class={props.text}
			style={{ color: props.color }}
		>
			{'t'}
		</i>
	</div>
}
