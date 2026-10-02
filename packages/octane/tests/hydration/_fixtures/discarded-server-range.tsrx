// Server content that hydration discards so the client can build what it
// renders in that place instead. Each component's server output is chosen by
// its props; hydrating with other props forces the recovery.
import { Hydrate, createElement, type ComponentBody } from 'octane';
import type { HydrationStrategy } from 'octane/hydration';

function Label(props: { v: string }) @{
	<em>{props.v}</em>
}

// An @if arm that only the server renders.
export function Branch(props: { on: boolean }) @{
	<section>
		@if (props.on) {
			<b>{'server'}</b>
		}
		<i>{'tail'}</i>
	</section>
}

// A list whose server arm (items or @empty) differs from the client's.
export function Rows(props: { rows: string[] }) @{
	<ul>
		@for (const row of props.rows; key row) {
			<li class="row">{row}</li>
		} @empty {
			<li class="empty">{'none'}</li>
		}
	</ul>
}

// A server built from another version of the page, which rendered a keyed
// component list in the place where the client renders an @if. The list's
// first item range does not span the place, so it cannot be the branch's.
export function ServerList(props: { ids: string[] }) @{
	<section>{props.ids.map((id) => <Label key={id} v={id} />)}</section>
}

export function ClientBranch(props: { on: boolean }) @{
	<section>
		@if (props.on) {
			<b>{'branch'}</b>
		}
	</section>
}

// A runtime host element whose content the server rendered as text, where
// the client renders an element with a component inside it.
export function Host(props: { text: boolean }) @{
	const host = createElement(
		'div',
		{ class: 'host' },
		props.text ? 'server' : createElement('p', null, createElement(Label, { v: 'client' })),
	);
	<section>{host}</section>
}

// The list hydrates before its sibling suspends the boundary, so the
// boundary's next attempt finds the list's client arm.
export function SuspendedRows(props: { rows: string[]; Tail: ComponentBody }) @{
	<main>
		@try {
			<>
				<Rows rows={props.rows} />
				<props.Tail />
			</>
		} @pending {
			<i>{'loading'}</i>
		}
	</main>
}

export function Tail() @{
	<p>{'tail'}</p>
}

export function DormantRows(props: { when: HydrationStrategy; rows: string[] }) @{
	<main>
		<Hydrate when={props.when} split={false}>
			<Rows rows={props.rows} />
		</Hydrate>
	</main>
}

export function DormantBranch(props: { when: HydrationStrategy; on: boolean }) @{
	<main>
		<Hydrate when={props.when} split={false}>
			<Branch on={props.on} />
		</Hydrate>
	</main>
}

export function DormantHost(props: { when: HydrationStrategy; text: boolean }) @{
	<main>
		<Hydrate when={props.when} split={false}>
			<Host text={props.text} />
		</Hydrate>
	</main>
}
