/**
 * What one change costs the store itself, with `held` reads observed and no
 * renderer: the shipped store against a model of the same data as a signal
 * graph. Run by store-side.mjs.
 *
 * The model holds what a store built on signals would: per record a confirmed
 * cell and a pending-edit cell, a derived cell showing one over the other, and
 * per read a derived cell over the records it selects. It has no validation,
 * persistence, loading or views, which none of the timed operations use.
 */
import {
	createDataStore,
	entity,
	read,
	receive,
	write,
	type DataStore,
	type StandardSchema,
} from 'octane/data';
import { createScope, type SignalHandle, type WritableSignal } from 'octane/signals';
import * as devalue from 'devalue';

// Node runs this file; the suite's tsconfig describes the browser page.
declare const process: { argv: string[] };

interface Item {
	readonly id: string;
	readonly label: string;
}
const schema = <T>(check: (value: any) => boolean): StandardSchema<unknown, T> => ({
	'~standard': {
		version: 1,
		vendor: 'bench',
		validate: (value) =>
			check(value) ? { value: value as T } : { issues: [{ message: 'does not match' }] },
	},
});
const isItem = (value: any) => typeof value?.id === 'string' && typeof value.label === 'string';
const Item = entity('item', schema<Item>(isItem));
const item = read({
	name: 'item',
	input: schema<{ id: string }>((value) => typeof value?.id === 'string'),
	output: schema<Item>(isItem),
	entities: (value) => Item.from(value),
	fresh: Infinity,
	keep: Infinity,
});
const setLabel = write({
	name: 'setLabel',
	input: schema<{ id: string; label: string }>((value) => typeof value?.label === 'string'),
	patches: Item,
});

const TARGET = 17;
const noop = () => {};

interface Subject {
	/**
	 * Change one record the way the named operation does; returns once readers
	 * were notified. A returned promise is the untimed rest of the operation, a
	 * write's refusal, awaited before the next one starts.
	 */
	readonly ops: Record<string, (label: string) => void | Promise<unknown>>;
	/** The target read's current label, and how often its observer was notified. */
	shown(): string;
	notified(): number;
	close(): Promise<void> | void;
}

function shipped(ids: readonly string[]): Subject {
	const rows = ids.map((id): Item => ({ id, label: `item ${id}` }));
	const store: DataStore = createDataStore({
		seed: devalue.stringify({
			reads: rows.map((row) => ({ name: item.name, input: { id: row.id }, age: 0, value: row })),
			cursors: [],
		}),
		// Every write is refused, so its edit rolls back, untimed, before the next one starts:
		// a confirmed patch would reload every held read of the entity.
		transport: async () => ({ ok: false, code: 'refused' }),
	});
	let notified = 0;
	const id = ids[TARGET]!;
	const handles = ids.map((each) => store.read(item, { id: each }));
	handles.forEach((handle, index) =>
		handle.subscribe(index === TARGET ? () => void notified++ : noop),
	);
	return {
		ops: {
			'receive a read': (label) =>
				receive(store, [{ read: item, input: { id }, value: { id, label } }]),
			'receive a record': (label) => receive(store, [{ put: Item, value: { id, label } }]),
			'optimistic write': (label) => store.write(setLabel, { id, label }).catch(noop),
		},
		shown: () => handles[TARGET]!.getSnapshot().value!.label,
		notified: () => notified,
		close: () => store.retire(),
	};
}

function graph(ids: readonly string[]): Subject {
	const scope = createScope({ scopeKey: 'octane:data' });
	const confirmed = new Map<string, WritableSignal<Item>>();
	const pending = new Map<string, WritableSignal<Partial<Item> | null>>();
	const reads: Array<SignalHandle<Item>> = [];
	for (const id of ids) {
		const confirmed$ = scope.signal$(`c\n${id}`, { id, label: `item ${id}` } as Item);
		const pending$ = scope.signal$<Partial<Item> | null>(`p\n${id}`, null);
		const shown$ = scope.derived$(`s\n${id}`, () => {
			const edit = pending$.get();
			return edit ? { ...confirmed$.get(), ...edit } : confirmed$.get();
		});
		confirmed.set(id, confirmed$);
		pending.set(id, pending$);
		reads.push(scope.derived$(`item\n${id}`, () => shown$.get()));
	}
	let notified = 0;
	reads.forEach((read$, index) => read$.subscribe(index === TARGET ? () => void notified++ : noop));
	const id = ids[TARGET]!;
	const put = (label: string) => scope.batch(() => confirmed.get(id)!.set({ id, label }));
	return {
		ops: {
			'receive a read': put,
			'receive a record': put,
			'optimistic write': (label) => {
				scope.batch(() => pending.get(id)!.set({ label }));
				return Promise.resolve().then(() => scope.batch(() => pending.get(id)!.set(null)));
			},
		},
		shown: () => reads[TARGET]!.get().label,
		notified: () => notified,
		close: () => scope.dispose(),
	};
}

const SUBJECTS = { shipped, graph };
const median = (values: number[]) => values.sort((a, b) => a - b)[values.length >> 1]!;

const quick = process.argv.includes('--quick');
const ROUNDS = quick ? 3 : 7;
const results: Array<Record<string, unknown>> = [];
for (const held of [1000, 5000, 20000]) {
	const ids = Array.from({ length: held }, (_, index) => `r${index}`);
	// Fewer operations where each one is slow, so every cell takes a similar time.
	const OPS = Math.max(20, Math.round(200_000 / held));
	for (const op of ['receive a read', 'receive a record', 'optimistic write']) {
		const row: Record<string, unknown> = { held, operation: op };
		for (const [name, create] of Object.entries(SUBJECTS)) {
			const samples: number[] = [];
			for (let round = 0; round < ROUNDS + 1; round++) {
				const subject = create(ids);
				const run = subject.ops[op]!;
				let label = '';
				let elapsed = 0;
				for (let index = 0; index < OPS; index++) {
					label = `edit ${round}.${index}`;
					const started = performance.now();
					const rest = run(label);
					elapsed += performance.now() - started;
					if (subject.shown() !== label) throw new Error(`${name} ${op}: shows ${subject.shown()}`);
					await rest;
				}
				if (subject.notified() < OPS) {
					throw new Error(`${name} ${op}: ${subject.notified()} notifications for ${OPS} changes`);
				}
				await subject.close();
				// The first round warms the code up.
				if (round > 0) samples.push((elapsed / OPS) * 1000);
			}
			row[`${name} µs`] = Number(median(samples).toFixed(2));
		}
		row['shipped÷graph'] = Number(
			((row['shipped µs'] as number) / (row['graph µs'] as number)).toFixed(1),
		);
		results.push(row);
	}
}
console.table(results);
