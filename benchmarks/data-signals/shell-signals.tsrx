import { memo } from 'octane';
import { derived$, type SignalHandle } from 'octane/signals';
import { useDataStore } from 'octane/data/octane';
import { read$ } from './cells.ts';
import { counts } from './shared.ts';
import {
	conversations,
	messages,
	notifications,
	settings,
	viewer,
	type Conversation,
	type Message,
} from './shell-data.ts';

function Item(props: { title: string }) @{
	counts.renders++;
	<li>{props.title as string}</li>
}

function Line(props: { message: Message; compact: boolean }) @{
	counts.renders++;
	<p class={props.compact ? 'msg compact' : 'msg'}>{props.message.text as string}</p>
}

const MemoItem = memo(Item);
const MemoLine = memo(Line);

function CellHeader() @{
	counts.renders++;
	const store = useDataStore();
	const who$ = read$(store.read(viewer));
	const notes$ = read$(store.read(notifications));
	<header>
		<span id="viewer">{who$.get().name as string}</span>
		<b id="badge">{String(notes$.get().unread)}</b>
	</header>
}

function CellSidebar() @{
	const list$ = read$(useDataStore().read(conversations));
	<ul>
		@for (const conversation of list$.get(); key conversation.id) {
			<MemoItem title={conversation.title} />
		}
	</ul>
}

function CellThread() @{
	const prefs$ = read$(useDataStore().read(settings));
	const compact = prefs$.get().compact;
	<section id="thread">
		@for (const message of messages; key message.id) {
			<MemoLine message={message} compact={compact} />
		}
	</section>
}

/** `cells`: the `hooks` shell, each part reading its signal with `.get()` while rendering. */
export function ShellCells() @{
	<main>
		<CellHeader />
		<CellSidebar />
		<CellThread />
	</main>
}

function BoundHeader() @{
	counts.renders++;
	const store = useDataStore();
	const who$ = read$(store.read(viewer));
	const notes$ = read$(store.read(notifications));
	const name$ = derived$(() => who$.get().name);
	const unread$ = derived$(() => String(notes$.get().unread));
	<header>
		<span id="viewer">{name$ as string}</span>
		<b id="badge">{unread$ as string}</b>
	</header>
}

function BoundItem(props: { list$: SignalHandle<Conversation[]>; index: number }) @{
	counts.renders++;
	const list$ = props.list$;
	const index = props.index;
	const title$ = derived$(() => list$.get()[index]!.title);
	<li>{title$ as string}</li>
}
const MemoBoundItem = memo(BoundItem);

function BoundSidebar() @{
	const list$ = read$(useDataStore().read(conversations));
	// Renders again only when the conversations themselves change: a rename keeps the ids.
	const ids$ = derived$(() =>
		list$
			.get()
			.map((conversation) => conversation.id)
			.join('\n'),
	);
	const rows = ids$
		.get()
		.split('\n')
		.map((id, index) => ({ id, index }));
	<ul>
		@for (const row of rows; key row.id) {
			<MemoBoundItem list$={list$} index={row.index} />
		}
	</ul>
}

function BoundLine(props: { message: Message; class$: SignalHandle<string> }) @{
	counts.renders++;
	<p class={props.class$}>{props.message.text as string}</p>
}
const MemoBoundLine = memo(BoundLine);

function BoundThread() @{
	const prefs$ = read$(useDataStore().read(settings));
	const class$ = derived$(() => (prefs$.get().compact ? 'msg compact' : 'msg'));
	<section id="thread">
		@for (const message of messages; key message.id) {
			<MemoBoundLine message={message} class$={class$} />
		}
	</section>
}

/** `bound`: each shown value is a `derived$` bound to its text or attribute, so a write renders no component. */
export function ShellBound() @{
	<main>
		<BoundHeader />
		<BoundSidebar />
		<BoundThread />
	</main>
}
