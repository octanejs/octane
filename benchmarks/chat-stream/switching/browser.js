import {
	ROOM_NAMES,
	ROW_COUNT,
	createModel,
	expectedPreview,
	expectedReply,
	expectedRow,
} from './model.js';

function check(condition, message) {
	if (!condition) throw new Error(message);
}

const host = document.getElementById('root');
let session;

export function pressed(id, event) {
	check(event.isTrusted, 'Expected a trusted pointer press');
	if (event.button === 0 && id !== session.rooms.at(-1).id) show(id, event.timeStamp);
}

export function tailCommitted() {
	session.tailCommitted?.();
}

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
		root.render({ rooms, committed, evicted, model });
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

export function install(createView) {
	window.bench = {
		start() {
			check(!session, 'Previous session still mounted');
			session = {
				model: createModel(),
				root: createView(host),
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
}
