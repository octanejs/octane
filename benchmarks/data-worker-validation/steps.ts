/**
 * The bench's two steps, shared by the Node and Chromium tabs: each runs
 * `iterations` times through `measure`, which records what its runtime can.
 */
import { createReplica, memoryStorage, type DataStore, type ReadHandle } from 'octane/data';
import { KEY, PARTITION, rows, type Row } from './contracts.ts';

const never = () => new Promise<never>(() => {});
const replicaOptions = {
	transport: never,
	listen: () => {
		throw new Error('the tab did not share its owner');
	},
	contracts: [rows],
	persist: { storage: memoryStorage(), partition: PARTITION, key: KEY },
};

/** A tab's link to one lane's worker. */
export interface Link {
	/** A new port to the worker's owner. */
	port(): { port: Parameters<typeof createReplica>[0]; close(): void };
	ask<T>(message: object): Promise<T>;
}

export type Measure<S> = (run: () => Promise<Row[]>) => Promise<S>;

function connect(link: Link): { store: DataStore; close(): void } {
	const { port, close } = link.port();
	const store = createReplica(port, replicaOptions);
	return {
		store,
		close() {
			void store.dispose();
			close();
		},
	};
}

/** Resolves once `handle` shows a value other than `before`. */
function next(handle: ReadHandle<Row[]>, before: Row[] | undefined): Promise<Row[]> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('no value within 10 s')), 10_000);
		const check = () => {
			const snapshot = handle.getSnapshot();
			if (snapshot.status !== 'ready' || snapshot.value === before) return;
			clearTimeout(timer);
			unsubscribe();
			resolve(snapshot.value!);
		};
		const unsubscribe = handle.subscribe(check);
		check();
	});
}

/** `iterations` replies: `refresh()` an observed read until the tab shows the new value. */
export async function replies<S>(
	link: Link,
	iterations: number,
	measure: Measure<S>,
): Promise<S[]> {
	await link.ask({ offline: false, calls: true });
	const { store, close } = connect(link);
	const handle = store.read(rows);
	const keep = handle.subscribe(() => {});
	let value = await next(handle, undefined);
	const samples: S[] = [];
	for (let index = 0; index < iterations; index++) {
		samples.push(
			await measure(async () => {
				const before = value;
				void handle.refresh();
				return (value = await next(handle, before));
			}),
		);
	}
	keep();
	close();
	// Let the worker save the last reply before the restores read it back.
	await new Promise((resolve) => setTimeout(resolve, 100));
	return samples;
}

/** `iterations` restores: a new replica, offline, shows the worker's cached value. */
export async function restores<S>(
	link: Link,
	iterations: number,
	measure: Measure<S>,
): Promise<S[]> {
	await link.ask({ offline: true, calls: true });
	const samples: S[] = [];
	for (let index = 0; index < iterations; index++) {
		let session: ReturnType<typeof connect> | undefined;
		samples.push(
			await measure(() => {
				session = connect(link);
				return next(session.store.read(rows), undefined);
			}),
		);
		session!.close();
	}
	return samples;
}
