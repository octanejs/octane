// A renderable hole whose value is a list, and compiled @for lists, hydrated
// over server content that the client's items do not match: a list where the
// client renders nothing, a bare server item where the client's item needs a
// range of its own or has another tag, and fewer or more server items than
// client items.
import { Hydrate, createElement, use, type OctaneNode } from 'octane';
import type { HydrationStrategy } from 'octane/hydration';

type Kind =
	| 'null'
	| 'empty'
	| 'nothing'
	| 'text'
	| 'pi'
	| 'framed'
	| 'i'
	| 'p'
	| 'p-child'
	| 'p3'
	| 'p-child3';

interface HoleProps {
	kind: Kind;
	v: string;
	// A component child waits for a pending `text`; null renders it now.
	text: Promise<string> | null;
	// A sibling after the list waits for a pending `later`; null renders none.
	later: Promise<string> | null;
}

function Waits(props: { text: Promise<string> }) @{
	<em class="waits">{use(props.text)}</em>
}

function Now(props: { v: string }) @{
	<em class="now">{props.v}</em>
}

function child(text: Promise<string> | null, v: string): OctaneNode {
	return text === null ? createElement(Now, { v }) : createElement(Waits, { text });
}

function wait(later: Promise<string> | null): OctaneNode {
	return later === null ? null : createElement(Waits, { text: later });
}

function pick(kind: Kind, v: string, text: Promise<string> | null): OctaneNode {
	switch (kind) {
		case 'null':
			return null;
		case 'empty':
			return [];
		case 'nothing':
			return [null, false];
		case 'pi':
			return [createElement('p', { key: 'a' }, v), createElement('i', { key: 'b' }, v)];
		case 'framed':
			return [createElement(Now, { key: 'a', v }), createElement(Now, { key: 'b', v })];
		case 'i':
			return [createElement('i', { key: 'a' }, v)];
		case 'p':
			return [createElement('p', { key: 'a' }, v)];
		case 'p-child':
			return [createElement('p', { key: 'a' }, child(text, v))];
		case 'p3':
			return [
				createElement('p', { key: 'a' }, v),
				createElement('p', { key: 'b' }, v),
				createElement('p', { key: 'c' }, v),
			];
		case 'p-child3':
			return [
				createElement('p', { key: 'a' }, v),
				createElement('p', { key: 'b' }, child(text, v)),
				createElement('p', { key: 'c' }, child(text, v)),
			];
		default:
			return v;
	}
}

// A trailing host follows the value.
export function Hole(props: HoleProps) @{
	<main>
		@try {
			<section class="hole">
				{pick(props.kind, props.v, props.text)}
				<b>{props.v}</b>
				{wait(props.later)}
			</section>
		} @pending {
			<u>loading</u>
		}
	</main>
}

interface RowsProps {
	rows: string[];
	text: Promise<string> | null;
	later: Promise<string> | null;
}

// Every row after the first has a component child.
function extra(row: string, text: Promise<string> | null): OctaneNode {
	return row === 'a' ? null : child(text, row);
}

// Direct-host rows, which the server emits without a range per row.
export function Rows(props: RowsProps) @{
	<main>
		@try {
			<section>
				<ul class="rows">
					@for (const row of props.rows; key row) {
						<li class="row">{row}</li>
					}
				</ul>
				<b>tail</b>
				{wait(props.later)}
			</section>
		} @pending {
			<u>loading</u>
		}
	</main>
}

function Row(props: { row: string; text: Promise<string> | null }) @{
	<>
		<li class="row">{props.row}</li>
		{extra(props.row, props.text)}
	</>
}

// Multi-root rows, which the server frames one range per row.
export function FramedRows(props: RowsProps) @{
	<main>
		@try {
			<section>
				<ul class="framed">
					@for (const row of props.rows; key row) {
						<Row row={row} text={props.text} />
					}
				</ul>
				<b>tail</b>
				{wait(props.later)}
			</section>
		} @pending {
			<u>loading</u>
		}
	</main>
}

export function DormantHole(props: HoleProps & { when: HydrationStrategy }) @{
	<div>
		<Hydrate when={props.when} split={false}>
			<Hole kind={props.kind} v={props.v} text={props.text} later={props.later} />
		</Hydrate>
	</div>
}

export function DormantRows(props: RowsProps & { when: HydrationStrategy }) @{
	<div>
		<Hydrate when={props.when} split={false}>
			<FramedRows rows={props.rows} text={props.text} later={props.later} />
		</Hydrate>
	</div>
}
