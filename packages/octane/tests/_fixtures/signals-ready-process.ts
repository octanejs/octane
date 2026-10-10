import assert from 'node:assert/strict';
import { setTimeout as task } from 'node:timers/promises';
import { createResource, createScope, derived$, query, runWithSignalOwner } from 'octane/signals';

// An external process owns the deadline. These timers must actually get a turn
// while the iterators remain ready; no value limit can end their microtask chain.
const producers = Number(process.argv[2]);
const seen = Array.from({ length: producers }, () => 0);
const closed = Array.from({ length: producers }, () => 0);
const owners = Array.from({ length: producers }, (_, index) =>
	createScope({ scopeKey: `ready-${index}` }),
);
const stops: Array<() => void> = [];
for (let index = 0; index < producers; index++) {
	const iterable: AsyncIterable<number> = {
		[Symbol.asyncIterator]() {
			let value = 0;
			return {
				next: () => Promise.resolve({ done: false, value: ++value }),
				return() {
					closed[index]++;
					return Promise.resolve({ done: true, value: undefined });
				},
			};
		},
	};
	const owner = owners[index];
	const value$ =
		index % 2
			? derived$(() => iterable, { key: `derived-${index}` })
			: createResource(owner, `query-${index}`, () =>
					query(`query-${index}`, () => iterable, { kind: 'stream' })(undefined),
				);
	runWithSignalOwner(owner, () => {
		stops.push(
			value$.subscribe(() => {
				const snapshot = value$.snapshot();
				if (snapshot.status === 'error') throw snapshot.error;
				if (snapshot.status === 'ready' && !snapshot.complete) {
					assert.equal(snapshot.value, seen[index] + 1, 'publication order');
					seen[index] = snapshot.value;
				}
			}),
		);
	});
}
const samples: number[][] = [];
for (let round = 0; round < 3; round++) {
	await task(25);
	const previous = samples.at(-1) ?? owners.map(() => 0);
	assert.ok(
		seen.every((value, index) => value > previous[index]),
		'every producer progresses',
	);
	samples.push([...seen]);
}
for (const stop of stops) stop();
for (const owner of owners) owner.dispose();
const atDisposal = [...seen];
await task(25);
assert.deepEqual(seen, atDisposal, 'disposal stops further publications');
assert.deepEqual(
	closed,
	owners.map(() => 1),
	'every iterator is closed once',
);
console.log(JSON.stringify({ samples, closed }));
