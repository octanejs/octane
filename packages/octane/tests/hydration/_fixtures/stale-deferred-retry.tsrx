import { Hydrate, use } from 'octane';
import { load } from 'octane/hydration';

type Props = { slow?: Promise<string> };

function Em() @{
	<em>{'e'}</em>
}

function A(_props: Props) @{
	<b>{'A'}</b>
}

function B(_props: Props) @{
	<i>{'B'}</i>
}

function Slow(props: Props) @{
	<i>{use(props.slow!) as string}</i>
}

function Pend(props: { server?: boolean; leaf: Promise<string> }) @{
	<u>{(props.server ? 'z' : use(props.leaf)) as string}</u>
}

// The first client attempt adopts `<C />` and the rows, then suspends at
// Pend's `<u>`. A parent update while it is pending can swap `C`, possibly for
// one that suspends in the retry, or change the rows before the retry resumes.
export function DynProbe(props: {
	server?: boolean;
	k: string;
	leaf: Promise<string>;
	slow: Promise<string>;
	items: string[];
}) @{
	const C =
		props.k === 'a'
			? A
			: props.k === 's'
				? Slow
				: B;
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				<C slow={props.slow} />
				@for (const item of props.items; key item) {
					<s>{item as string}</s>
				}
				<Pend server={props.server} leaf={props.leaf} />
				<Em />
			</section>
		</Hydrate>
	</div>
}

// The same retry through a renderable hole, whose value can swap components or
// switch between a component, a list, text, and nothing. `Lead` is a dynamic
// call, so the retry's update leaves the cursor past it, on the static text.
export function HoleProbe(props: {
	server?: boolean;
	k: string;
	leaf: Promise<string>;
	slow: Promise<string>;
	lead?: boolean;
}) @{
	const Lead = props.lead ? B : Em;
	const node =
		props.k === 'a'
			? <A />
			: props.k === 'b'
				? <B />
				: props.k === 's'
					? <Slow slow={props.slow} />
					: props.k === 'l'
						? [<A key="a" />, <B key="b" />]
						: props.k === 'L'
							? [<A key="a" />, <Slow key="s" slow={props.slow} />]
							: props.k === 'n'
								? null
								: props.k;
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				<Lead />
				{'mid'}
				{node}
				<Pend server={props.server} leaf={props.leaf} />
			</section>
		</Hydrate>
	</div>
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

// Rows that a retry inserts, then opens in a later retry. Gate suspends the
// retry that inserts them, so they finish before a later capture change opens
// one and its Slow suspends; the retry after that resumes inside the row.
export function RowProbe(props: {
	server?: boolean;
	leaf: Promise<string>;
	gate: Promise<string>;
	slow: Promise<string>;
	items: string[];
	open?: string;
}) @{
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
