import { Activity, memo, useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import {
	RetainedSignalProvider,
	useRetainedSignalValue,
	useSignalValue,
} from 'octane/signals/react';
import {
	ROOM_NAMES,
	ROW_COUNT,
	createModel,
	expectedPreview,
	expectedReply,
	expectedRow,
} from './model.js';

function messageBody(kind, text) {
	switch (kind) {
		case 'checklist':
			return (
				<ul>
					{text.split('\n').map((item, i) => (
						<li key={i}>{i ? '\n' + item : item}</li>
					))}
				</ul>
			);
		case 'reading':
			return <pre>{text}</pre>;
		case 'question':
			return <blockquote>{text}</blockquote>;
		case 'attachment':
			return (
				<figure>
					<figcaption>{text}</figcaption>
				</figure>
			);
		default:
			return <p>{text}</p>;
	}
}

function LatestReply({ id, text }) {
	useLayoutEffect(() => {
		session.tailCommitted?.();
	}, [text]);
	return <p id={id}>{text}</p>;
}

function Message({ row, latest }) {
	const author = useRetainedSignalValue(row.author$);
	const presence = useRetainedSignalValue(row.presence$);
	const body = useRetainedSignalValue(row.body$);
	const status = useRetainedSignalValue(row.status$);
	const reactions = useSignalValue(row.reactions$);
	return (
		<article data-kind={row.kind}>
			<header>
				<strong>{author}</strong>
				<small>{presence}</small>
			</header>
			{latest ? <LatestReply id={latest} text={body} /> : messageBody(row.kind, body)}
			<footer>
				<span>{status}</span>
				<span>{reactions}</span>
			</footer>
		</article>
	);
}

function Preview({ room }) {
	const preview = useSyncExternalStore(room.subscribePreview, room.readPreview);
	return <output>{preview}</output>;
}

const Conversation = memo(function Conversation({ room }) {
	return (
		<section id={'room-' + room.id} aria-label={ROOM_NAMES[room.id]}>
			<h1 id={'title-' + room.id}>{ROOM_NAMES[room.id]}</h1>
			<Preview room={room} />
			<div className="history">
				<div>
					{room.rows.map((row) => (
						<Message
							key={row.index}
							row={row}
							latest={row.index === ROW_COUNT - 1 ? 'latest-' + room.id : undefined}
						/>
					))}
				</div>
			</div>
		</section>
	);
});

function Chat({ rooms, committed, evicted, model }) {
	const active = rooms.at(-1).id;
	useLayoutEffect(committed, [committed]);
	useEffect(() => {
		// Hidden Activity readers finish releasing in a microtask after removal.
		if (evicted !== undefined) queueMicrotask(() => model.evict(evicted));
	}, [model, evicted]);
	return (
		<RetainedSignalProvider>
			<nav aria-label="Conversations">
				{ROOM_NAMES.map((name, id) => (
					<button
						key={id}
						data-target={id}
						aria-current={id === active ? 'page' : undefined}
						onPointerDown={(event) => {
							check(event.isTrusted, 'Expected a trusted pointer press');
							if (event.button === 0 && id !== active) show(id, event.timeStamp);
						}}
					>
						{name}
					</button>
				))}
			</nav>
			{rooms
				.toSorted((a, b) => a.id - b.id)
				.map((room) => (
					<Activity key={room.id} mode={room.id === active ? 'visible' : 'hidden'}>
						<RetainedSignalProvider>
							<Conversation room={room} />
						</RetainedSignalProvider>
					</Activity>
				))}
		</RetainedSignalProvider>
	);
}

function check(condition, message) {
	if (!condition) throw new Error(message);
}

const host = document.getElementById('root');
let session;

function show(id, pressTime) {
	const started = pressTime ?? performance.now();
	const { model, root } = session;
	if (pressTime !== undefined) model.advance();
	const rooms = session.rooms.filter((room) => room.id !== id);
	const evicted = rooms.length === 2 ? rooms.shift().id : undefined;
	rooms.push(model.open(id));
	session.rooms = rooms;
	session.pending = new Promise((resolve, reject) => {
		function committed() {
			const commit = performance.now() - started;
			const pane = document.getElementById('room-' + id);
			const title = document.getElementById('title-' + id);
			const tail = document.getElementById('latest-' + id);
			if (pane.style.display === 'none' || title.textContent !== ROOM_NAMES[id]) {
				reject(new Error('Room ' + id + ' was still hidden or mistitled at layout commit'));
				return;
			}
			const expected = expectedReply(id, model.tick);
			const staleAtCommit = tail.textContent !== expected;
			function finish(ready) {
				requestAnimationFrame(() => {
					if (pressTime !== undefined) model.advance();
					requestAnimationFrame(() => {
						const frame = performance.now() - started;
						if (tail.textContent !== expectedReply(id, model.tick)) {
							reject(new Error(`Stale frame in room ${id}, tick ${model.tick}`));
							return;
						}
						resolve({ commit, ready, frame, staleAtCommit });
					});
				});
			}
			if (!staleAtCommit) {
				finish(commit);
				return;
			}
			// Revealing a memoized Activity can commit its old DOM before the
			// external store reconnects. Observe the first current reply commit.
			const timeout = setTimeout(() => {
				reject(new Error(`Reply still stale in room ${id}, tick ${model.tick}`));
			}, 5_000);
			session.tailCommitted = () => {
				const ready = performance.now() - started;
				if (tail.textContent === expected) {
					clearTimeout(timeout);
					session.tailCommitted = undefined;
					finish(ready);
				}
			};
		}
		root.render(<Chat rooms={rooms} committed={committed} evicted={evicted} model={model} />);
	});
	return session.pending;
}

function onScreen(node) {
	const { left, top, width, height } = node.getBoundingClientRect();
	return (
		width > 0 &&
		height > 0 &&
		node.contains(document.elementFromPoint(left + width / 2, top + height / 2))
	);
}

function verify(expectedRooms, tick, full = true) {
	const id = expectedRooms.at(-1);
	const { previous } = session;
	check(session.model.tick === tick, 'Unexpected feed tick');
	const title = document.getElementById('title-' + id);
	const tail = document.getElementById('latest-' + id);
	check(onScreen(title) && onScreen(tail), 'Destination title or reply outside viewport');
	check(tail.textContent === expectedReply(id, tick), 'Stale streamed reply');
	const pane = document.getElementById('room-' + id);
	check(pane.querySelector('output').textContent === expectedPreview(id, tick), 'Stale preview');
	check(host.querySelectorAll('section').length === expectedRooms.length, 'Wrong pane count');
	for (const [room, node] of previous) {
		if (!expectedRooms.includes(room)) {
			check(!node.isConnected, 'Evicted reply still connected');
			previous.delete(room);
		}
	}
	for (const room of expectedRooms) {
		const node = document.getElementById('latest-' + room);
		const visible = node?.getClientRects().length > 0;
		check(node && visible === (room === id), 'Wrong visible pane');
		check(!previous.has(room) || previous.get(room) === node, 'Retained reply remounted');
		previous.set(room, node);
	}
	if (full) {
		const rows = pane.querySelectorAll('article');
		check(rows.length === ROW_COUNT, 'Wrong transcript length');
		rows.forEach((row, i) => {
			const { kind, author, presence, body, status, reactions } = expectedRow(id, i, tick);
			check(
				row.dataset.kind === kind &&
					row.textContent === author + presence + body + status + reactions,
				'Stale or foreign message in room ' + id + ', row ' + i + ', tick ' + tick,
			);
		});
		session.model.verify(expectedRooms);
	}
}

window.bench = {
	start() {
		check(!session, 'Previous session still mounted');
		session = {
			model: createModel(),
			root: createRoot(host),
			rooms: [],
			previous: new Map(),
		};
		return show(0);
	},
	async advance() {
		session.model.advance();
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	},
	settled: () => session.pending,
	verify,
	async dispose() {
		session.root.unmount();
		await Promise.resolve();
		session.model.dispose();
		check(!host.hasChildNodes(), 'Unmount left conversation DOM');
		session = undefined;
	},
};
