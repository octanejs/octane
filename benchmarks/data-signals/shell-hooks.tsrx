import { memo } from 'octane';
import { useDataStore, useRead } from 'octane/data/octane';
import { counts } from './shared.ts';
import {
	conversations,
	messages,
	notifications,
	settings,
	viewer,
	type Conversation,
	type Message,
	type Notifications,
	type Settings,
	type Viewer,
} from './shell-data.ts';

function Header(props: { name: string; unread: number }) @{
	counts.renders++;
	<header>
		<span id="viewer">{props.name as string}</span>
		<b id="badge">{String(props.unread)}</b>
	</header>
}

function Item(props: { conversation: Conversation }) @{
	counts.renders++;
	<li>{props.conversation.title as string}</li>
}

function Line(props: { message: Message; compact: boolean }) @{
	counts.renders++;
	<p class={props.compact ? 'msg compact' : 'msg'}>{props.message.text as string}</p>
}

/** `hooks-top`: the shell reads everything and passes it down, as a top-level provider does. */
export function ShellTop() @{
	const store = useDataStore();
	const who: Viewer = useRead(store.read(viewer));
	const prefs: Settings = useRead(store.read(settings));
	const notes: Notifications = useRead(store.read(notifications));
	const list: Conversation[] = useRead(store.read(conversations));
	<main>
		<Header name={who.name} unread={notes.unread} />
		<ul>
			@for (const conversation of list; key conversation.id) {
				<Item conversation={conversation} />
			}
		</ul>
		<section id="thread">
			@for (const message of messages; key message.id) {
				<Line message={message} compact={prefs.compact} />
			}
		</section>
	</main>
}

const MemoItem = memo(Item);
const MemoLine = memo(Line);

function ReadingHeader() @{
	const store = useDataStore();
	const who: Viewer = useRead(store.read(viewer));
	const notes: Notifications = useRead(store.read(notifications));
	<Header name={who.name} unread={notes.unread} />
}

function Sidebar() @{
	const list: Conversation[] = useRead(useDataStore().read(conversations));
	<ul>
		@for (const conversation of list; key conversation.id) {
			<MemoItem conversation={conversation} />
		}
	</ul>
}

function Thread() @{
	const prefs: Settings = useRead(useDataStore().read(settings));
	<section id="thread">
		@for (const message of messages; key message.id) {
			<MemoLine message={message} compact={prefs.compact} />
		}
	</section>
}

/** `hooks`: each part of the shell reads what it shows, over memoized rows. */
export function ShellHooks() @{
	<main>
		<ReadingHeader />
		<Sidebar />
		<Thread />
	</main>
}
