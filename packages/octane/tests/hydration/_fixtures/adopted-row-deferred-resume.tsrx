import { Hydrate, use } from 'octane';
import { load } from 'octane/hydration';

// A deferred boundary whose retries suspend at Pend, then at Gate. Between
// them the parent opens the server-adopted row `x`, whose @if arm builds Slow,
// which suspends in turn. Row and Em are lite (hookless) components, so their
// scopes carry DOM-context proxies rather than Blocks of their own.
function Em() @{
	<em>{'e'}</em>
}

function Slow(props: { slow?: Promise<string> }) @{
	<i>{use(props.slow!) as string}</i>
}

// A use() declaration suspends through the compiled batch, before use() itself
// records the promise on the component.
function BatchedSlow(props: { slow?: Promise<string> }) @{
	const value = use(props.slow!);
	<i>{value as string}</i>
}

function Pend(props: { server?: boolean; leaf: Promise<string> }) @{
	<u>{(props.server ? 'z' : use(props.leaf)) as string}</u>
}

function Gate(props: { server?: boolean; gate: Promise<string> }) @{
	<q>{(props.server ? 'g' : use(props.gate)) as string}</q>
}

function Row(props: { item: string; open: boolean; slow: Promise<string> }) @{
	<s>
		{props.item as string}
		@if (props.open) {
			<Slow slow={props.slow} />
		}
	</s>
}

function BatchedRow(props: { item: string; open: boolean; slow: Promise<string> }) @{
	<s>
		{props.item as string}
		@if (props.open) {
			<BatchedSlow slow={props.slow} />
		}
	</s>
}

interface ProbeProps {
	server?: boolean;
	leaf: Promise<string>;
	gate: Promise<string>;
	slow: Promise<string>;
	items: string[];
	open?: string;
}

export function RowProbe(props: ProbeProps) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@for (const item of props.items; key item) {
					<Row item={item} open={item === props.open} slow={props.slow} />
				}
				<Pend server={props.server} leaf={props.leaf} />
				<Gate server={props.server} gate={props.gate} />
				<Em />
			</section>
		</Hydrate>
	</div>
}

export function BatchedRowProbe(props: ProbeProps) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@for (const item of props.items; key item) {
					<BatchedRow item={item} open={item === props.open} slow={props.slow} />
				}
				<Pend server={props.server} leaf={props.leaf} />
				<Gate server={props.server} gate={props.gate} />
				<Em />
			</section>
		</Hydrate>
	</div>
}
