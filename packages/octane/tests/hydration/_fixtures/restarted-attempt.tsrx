import { Hydrate, use } from 'octane';
import { load } from 'octane/hydration';

// Hydration attempts that suspend after a template's adoption deferred a
// mismatch, are discarded, and meet the mismatch again when they retry.

/** Data that every attempt reads, as a module-level cached request is. */
export const data: { promise?: Promise<string> } = {};
export const gate: { promise?: Promise<void> } = {};

function read(value: unknown): string {
	if (value !== undefined) throw value;
	return 'ok';
}

function Shared() @{
	<p>{use(data.promise!) as string}</p>
}

function GateLeaf() @{
	<i>{read(gate.promise) as string}</i>
}

// A fragment led by the suspending leaf: its adoption over the server's <b>
// fails, and the leaf's body runs before any of its hosts is compared.
function GateFirst() @{
	<>
		<GateLeaf />
		<em>{'x'}</em>
	</>
}

export function IslandSeeds(props: { server?: boolean }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<Shared />
			@if (props.server) {
				<b class="server">{'server'}</b>
			} @else {
				<GateFirst />
			}
		</Hydrate>
	</div>
}

export function ArmSeeds(props: { server?: boolean }) @{
	<div>
		@try {
			<>
				<Shared />
				@if (props.server) {
					<b class="server">{'server'}</b>
				} @else {
					<GateFirst />
				}
			</>
		} @pending {
			<s>{'pending'}</s>
		}
	</div>
}
