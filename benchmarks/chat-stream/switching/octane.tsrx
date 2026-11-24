import {
	Activity,
	createRoot,
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useSyncExternalStore,
} from 'octane';
import { readSignalBinding, type SignalHandle } from 'octane/signals';
import { install, pressed, tailCommitted } from './browser.js';
import { ROOM_NAMES, ROW_COUNT } from './model.js';

interface Row {
	index: number;
	kind: string;
	author$: SignalHandle<string>;
	presence$: SignalHandle<string>;
	body$: SignalHandle<string>;
	status$: SignalHandle<string>;
	reactions$: SignalHandle<string>;
}

interface Room {
	id: number;
	rows: Row[];
	preview$: SignalHandle<string>;
}

interface ChatProps {
	rooms: Room[];
	committed: () => void;
	evicted: number | undefined;
	model: { evict(id: number): void };
}

// The store effect owns the subscription so Activity releases it on hide.
// readSignalBinding avoids also registering a retained native render read.
function useVisibleSignal(handle$: SignalHandle<string>) {
	const subscribe = useCallback((notify: () => void) => handle$.subscribe(notify), [handle$]);
	const read = useCallback(() => readSignalBinding(handle$), [handle$]);
	return useSyncExternalStore(subscribe, read);
}

function LatestReply({ id, text }: { id: string; text: string }) @{
	useLayoutEffect(tailCommitted, [text]);
	<p id={id}>{text as string}</p>
}

function Message({ row, latest }: { row: Row; latest: string | undefined }) @{
	const body = row.body$.get();
	const reactions = useVisibleSignal(row.reactions$);
	<article data-kind={row.kind}>
		<header>
			<strong>{row.author$.get() as string}</strong>
			<small>{row.presence$.get() as string}</small>
		</header>
		@if (latest) {
			<LatestReply id={latest} text={body} />
		} @else {
			@switch (row.kind) {
				@case 'checklist': {
					<ul>
						@for (const item of body.split('\n'); index i; key i) {
							<li>{(i ? '\n' + item : item) as string}</li>
						}
					</ul>
				}
				@case 'reading': {
					<pre>{body as string}</pre>
				}
				@case 'question': {
					<blockquote>{body as string}</blockquote>
				}
				@case 'attachment': {
					<figure>
						<figcaption>{body as string}</figcaption>
					</figure>
				}
				@default: {
					<p>{body as string}</p>
				}
			}
		}
		<footer>
			<span>{row.status$.get() as string}</span>
			<span>{reactions as string}</span>
		</footer>
	</article>
}

function Preview({ room }: { room: Room }) @{
	const preview = useVisibleSignal(room.preview$);
	<output>{preview as string}</output>
}

function Conversation({ room }: { room: Room }) @{
	<section id={'room-' + room.id} aria-label={ROOM_NAMES[room.id]}>
		<h1 id={'title-' + room.id}>{ROOM_NAMES[room.id] as string}</h1>
		<Preview room={room} />
		<div class="history">
			<div>
				@for (const row of room.rows; key row.index) {
					<Message
						row={row}
						latest={row.index === ROW_COUNT - 1 ? 'latest-' + room.id : undefined}
					/>
				}
			</div>
		</div>
	</section>
}

const MemoConversation = memo(Conversation);

function Chat({ rooms, committed, evicted, model }: ChatProps) @{
	const active = rooms.at(-1)!.id;
	const ordered = rooms.toSorted((a, b) => a.id - b.id);
	useLayoutEffect(committed, [committed]);
	useEffect(() => {
		if (evicted !== undefined) queueMicrotask(() => model.evict(evicted));
	}, [model, evicted]);
	<>
		<nav aria-label="Conversations">
			@for (const name of ROOM_NAMES; index id; key name) {
				<button
					data-target={id}
					aria-current={id === active ? 'page' : undefined}
					onPointerDown={(event: PointerEvent) => pressed(id, event)}
				>
					{name as string}
				</button>
			}
		</nav>
		@for (const room of ordered; key room.id) {
			<Activity mode={room.id === active ? 'visible' : 'hidden'}>
				<MemoConversation room={room} />
			</Activity>
		}
	</>
}

install((host: HTMLElement) => {
	const root = createRoot(host);
	return {
		render: (props: ChatProps) => root.render(Chat, props),
		unmount: () => root.unmount(),
	};
});
