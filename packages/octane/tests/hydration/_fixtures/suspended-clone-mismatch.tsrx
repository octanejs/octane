function read(value: unknown): string {
	if (value !== undefined) throw value;
	return 'ok';
}

export const gate: { promise?: Promise<void> } = {};

function GateLeaf() @{
	<i>{read(gate.promise) as string}</i>
}

function ClientMark() @{
	<s>{'client'}</s>
}

export function GateBranch(props: { server?: boolean }) @{
	<div>
		@try {
			@if (props.server) {
				<b class="server">{'server'}</b>
			} @else {
				<GateLeaf />
			}
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}

export function GateForm(props: { server?: boolean }) @{
	<div>
		@try {
			<>
				<input class="draft" />
				@if (props.server) {
					<b class="server">{'server'}</b>
				} @else {
					<>
						<ClientMark />
						<GateLeaf />
					</>
				}
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}

export function GateNested(props: { server?: boolean }) @{
	<div>
		@try {
			<>
				@try {
					@if (props.server) {
						<b class="server">{'server'}</b>
					} @else {
						<ClientMark />
					}
				} @pending {
					<p>{'inner pending'}</p>
				}
				<GateLeaf />
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}
