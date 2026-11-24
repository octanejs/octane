import { createFamily, createScope } from 'octane/signals';

export const ROOM_NAMES = ['Reed Bank', 'Willow Pool', 'Fern Reach', 'Stone Bend'];
export const ROW_COUNT = 224;

const last = ROW_COUNT - 1;
const names = ['Ash', 'Kit', 'Lou', 'Ren', 'Sky', 'Bo'];
const kinds = ['question', 'note', 'reading', 'checklist', 'attachment', 'reply'];
const plants = ['reed', 'sedge', 'rush', 'iris', 'mint'];
const streamSteps = 21;
const reports = [
	'The lower path is dry again. We counted fresh shoots along the gravel shelf and left a second stake where the bank turns. Please photograph both markers on the return walk.',
	'Willow branches trail across the gauge after last night’s wind. Reading it from the little footbridge puts the pool three marks below the spring line. The sketch shows where to stand for a clear view.',
	'Fern fronds shade the side channel all morning. Our first sample came from the sunny edge. We took another under the canopy for comparison.',
	'Pale stones outline a shallow run around the bend. The current carried our float past the old landing in half a minute, then slowed beside the fallen trunk. I marked both points on the map so the next team can time the same stretch.',
];

function kindAt(index) {
	return index === last ? 'reply' : kinds[index % kinds.length];
}

function initialBody(id, index) {
	if (index === last) return `${ROOM_NAMES[id]} field report — `;
	const plot = Math.floor(index / kinds.length) + 1;
	const site = `${ROOM_NAMES[id]}, plot ${plot}`;
	const plant = plants[(id + plot) % plants.length];
	switch (kindAt(index)) {
		case 'question':
			return `How far has the ${plant} spread at ${site}? Can we still reach the lower stake?`;
		case 'note':
			return `At ${site} the ${plant} reaches the water. A narrow strip of gravel is dry enough for a second count.`;
		case 'reading':
			return `${site}\nDepth ${12 + (plot % 9)} cm · Water ${14 + id} °C\nShoots ${plot * 3 + id}`;
		case 'checklist':
			return `${site}\n✓ Count the ${plant}\n✓ Mark the waterline\n□ Collect the gauge`;
		case 'attachment':
			return `Sketch of ${site} · ${plant}-${plot}.png · ${42 + plot} kB`;
		case 'reply':
			return `I can collect the gauge at ${site} after lunch.`;
	}
}

function roster(shift) {
	return names.map((name, i) => ({
		name,
		presence: i === shift % names.length ? 'Checking in' : 'In the field',
	}));
}

function authorIndex(id, index) {
	return (id + index + Math.floor(index / kinds.length)) % names.length;
}

function initialThanks(id, index) {
	return (index + id) % 5 === 0 ? 1 + id : 0;
}

function correction(tick) {
	return `\nVerified on pass ${tick}.`;
}

function reportStatus(tick) {
	return tick < streamSteps ? 'Writing' : 'Filed';
}

function summary(body) {
	const [title, text] = body.split(' — ');
	const words = text ? text.trimEnd().split(/\s+/).length : 0;
	return `${title} · ${words} ${words === 1 ? 'word' : 'words'}`;
}

export function expectedReply(id, tick) {
	const length = Math.floor((reports[id].length * tick) / streamSteps);
	return initialBody(id, last) + reports[id].slice(0, length);
}

// Reconstruct each row from its coordinates, without reading a feed or a signal.
export function expectedRow(id, index, tick) {
	const member = roster(Math.floor(tick / 3))[authorIndex(id, index)];
	const editTick = last - index - id;
	const thankTick = last - index + 1 - 2 * id;
	const edited = 0 < editTick && editTick <= tick;
	const thanked = 0 < thankTick && thankTick <= tick;
	const suffix = edited ? correction(editTick) : '';
	return {
		kind: kindAt(index),
		author: member.name,
		presence: member.presence,
		body: index === last ? expectedReply(id, tick) : initialBody(id, index) + suffix,
		status: index === last ? reportStatus(tick) : edited ? 'Edited' : 'Posted',
		reactions: `${initialThanks(id, index) + Number(thanked)} thanks`,
	};
}

export function expectedPreview(id, tick) {
	return summary(expectedReply(id, tick));
}

// A feed survives eviction. Each topic has one upstream connection shared by
// the local graph. Reconnecting synchronously delivers the current snapshot.
function createFeed() {
	const values = new Map();
	const listeners = new Map();
	return {
		values,
		listeners,
		publish(topic, value) {
			values.set(topic, value);
			listeners.get(topic)?.(value);
		},
		signal(scope, topic) {
			const value$ = scope.signal$(null, values.get(topic), {
				watched: function connectChannel() {
					if (listeners.has(topic)) throw new Error(`Already connected to ${topic}`);
					function receiveChannel(next) {
						value$.set(next);
					}
					listeners.set(topic, receiveChannel);
					receiveChannel(values.get(topic));
					return function disconnectChannel() {
						listeners.delete(topic);
					};
				},
			});
			return value$;
		},
	};
}

function history(id) {
	const feed = createFeed();
	const thanks = [];
	for (let index = 0; index < ROW_COUNT; index++) {
		feed.publish(index, {
			body: initialBody(id, index),
			status: index === last ? reportStatus(0) : 'Posted',
		});
		thanks.push(initialThanks(id, index));
	}
	feed.publish('thanks', thanks);
	return feed;
}

function update(feed, id, tick) {
	const index = last - tick - id;
	feed.publish(index, { body: feed.values.get(index).body + correction(tick), status: 'Edited' });
	const thanks = feed.values.get('thanks').slice();
	thanks[last - tick + 1 - 2 * id]++;
	feed.publish('thanks', thanks);
	if (tick <= streamSteps) {
		const text = reports[id];
		const start = Math.floor((text.length * (tick - 1)) / streamSteps);
		const end = Math.floor((text.length * tick) / streamSteps);
		feed.publish(last, {
			body: feed.values.get(last).body + text.slice(start, end),
			status: reportStatus(tick),
		});
	}
}

function project(scope, read) {
	return createFamily(scope, (index) => scope.derived$(null, () => read(index)));
}

export function createModel() {
	const root = createScope({ scopeKey: 'survey' });
	const team = createFeed();
	team.publish('roster', roster(0));
	const roster$ = team.signal(root, 'roster');
	const authors = project(root, (i) => roster$.get()[i].name);
	const presence = project(root, (i) => roster$.get()[i].presence);
	const feeds = ROOM_NAMES.map((_, id) => history(id));
	const rooms = new Map();
	let tick = 0;

	function open(id) {
		if (rooms.has(id)) return rooms.get(id);
		const scope = createScope({ scopeKey: 'room' });
		const feed = feeds[id];
		const thanks$ = feed.signal(scope, 'thanks');
		const messages = createFamily(scope, (i) => feed.signal(scope, i));
		const bodies = project(scope, (i) => messages.get(i).get().body);
		const statuses = project(scope, (i) => messages.get(i).get().status);
		const reactions = project(scope, (i) => `${thanks$.get()[i]} thanks`);
		const rows = Array.from({ length: ROW_COUNT }, (_, index) => {
			const member = authorIndex(id, index);
			return {
				index,
				kind: kindAt(index),
				author$: authors.get(member),
				presence$: presence.get(member),
				body$: bodies.get(index),
				status$: statuses.get(index),
				reactions$: reactions.get(index),
			};
		});
		const preview$ = scope.derived$(null, () => summary(bodies.get(last).get()));
		const room = {
			id,
			scope,
			rows,
			preview$,
			subscribePreview: (notify) => preview$.subscribe(notify),
			readPreview: () => preview$.get(),
		};
		rooms.set(id, room);
		return room;
	}

	function advance() {
		tick++;
		root.batch(() => {
			if (tick % 3 === 0) team.publish('roster', roster(tick / 3));
			for (let id = 0; id < feeds.length; id++) update(feeds[id], id, tick);
		});
	}

	function evict(id) {
		if (feeds[id].listeners.size) throw new Error(`Room ${id} still connected before eviction`);
		const { scope } = rooms.get(id);
		scope.dispose();
		if (!scope.retired) throw new Error(`Room ${id} scope survived eviction`);
		rooms.delete(id);
	}

	function verify(expectedRooms) {
		if (team.listeners.has('roster') !== Boolean(expectedRooms.length)) {
			throw new Error('Roster connection does not match mounted panes');
		}
		for (let id = 0; id < feeds.length; id++) {
			const retained = expectedRooms.includes(id);
			const visible = expectedRooms.at(-1) === id;
			if (rooms.has(id) !== retained) throw new Error(`Unexpected scope lifetime for room ${id}`);
			const { listeners } = feeds[id];
			if (listeners.has('thanks') !== visible)
				throw new Error(`Wrong reactions listener in room ${id}`);
			for (let i = 0; i < ROW_COUNT; i++) {
				if (listeners.has(i) !== retained)
					throw new Error(`Wrong listener on room ${id}, row ${i}`);
			}
		}
	}

	function dispose() {
		for (const id of rooms.keys()) evict(id);
		verify([]);
		root.dispose();
		if (!root.retired) throw new Error('Roster scope survived disposal');
		if (tick !== streamSteps) throw new Error(`Expected ${streamSteps} stream steps, got ${tick}`);
		for (let id = 0; id < feeds.length; id++) {
			const { body, status } = feeds[id].values.get(last);
			if (body !== initialBody(id, last) + reports[id] || status !== 'Filed') {
				throw new Error(`Incomplete report in room ${id}`);
			}
			update(feeds[id], id, tick + 1);
		}
		team.publish('roster', roster(0));
	}

	return {
		get tick() {
			return tick;
		},
		open,
		advance,
		evict,
		verify,
		dispose,
	};
}
