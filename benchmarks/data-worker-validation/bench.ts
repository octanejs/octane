/**
 * The tab: one replica per lane, connected to a worker that validates
 * (`worker`) or one that leaves validation to the tab (`page`). Each step
 * records the tab's busy time, from `performance.eventLoopUtilization`, and
 * how many times the tab ran the schema. See README.md.
 */
import { createReplica, memoryStorage, type DataStore, type ReadHandle } from 'octane/data';
import { performance } from 'node:perf_hooks';
import { MessageChannel, Worker } from 'node:worker_threads';
import { KEY, PARTITION, counter, rows, type Row } from './contracts.ts';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const ROUNDS = Number(args.find((arg) => /^\d+$/.test(arg)) ?? (quick ? 2 : 8));
const ITERATIONS = quick ? 5 : 20;
const COUNT = Number(process.env.ROWS ?? 5000);
const LANES = ['page', 'worker'] as const;
type Lane = (typeof LANES)[number];
const STEPS = ['reply', 'restore'] as const;
type Step = (typeof STEPS)[number];

const never = () => new Promise<never>(() => {});
const replicaOptions = {
	transport: never,
	listen: () => {
		throw new Error('the tab did not share its owner');
	},
	contracts: [rows],
	persist: { storage: memoryStorage(), partition: PARTITION, key: KEY },
};

interface Tab {
	worker: Worker;
	connect(): { store: DataStore; close(): void };
	ask<T>(message: object): Promise<T>;
}

function startWorker(validate: boolean): Tab {
	const worker = new Worker(new URL('./worker.mjs', import.meta.url), {
		workerData: { count: COUNT, validate },
	});
	return {
		worker,
		connect() {
			const channel = new MessageChannel();
			worker.postMessage({ port: channel.port1 }, [channel.port1]);
			const store = createReplica(channel.port2 as never, replicaOptions);
			return {
				store,
				close() {
					void store.dispose();
					channel.port2.close();
				},
			};
		},
		ask<T>(message: object) {
			return new Promise<T>((resolve) => {
				worker.once('message', resolve);
				worker.postMessage(message);
			});
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

interface Sample {
	busy: number;
	wall: number;
	pageCalls: number;
}

async function measure(run: () => Promise<Row[]>): Promise<Sample> {
	const calls = counter.calls;
	const elu = performance.eventLoopUtilization();
	const start = performance.now();
	const value = await run();
	const wall = performance.now() - start;
	const busy = performance.eventLoopUtilization(elu).active;
	if (value.length !== COUNT) throw new Error(`expected ${COUNT} rows, got ${value.length}`);
	return { busy, wall, pageCalls: counter.calls - calls };
}

/** One round of one lane: `ITERATIONS` replies, then as many restores from the worker's cache. */
async function round(tab: Tab): Promise<Record<Step, Sample[]>> {
	await tab.ask({ offline: false, calls: true });
	const { store, close } = tab.connect();
	const handle = store.read(rows);
	const keep = handle.subscribe(() => {});
	let value = await next(handle, undefined);
	const reply: Sample[] = [];
	for (let index = 0; index < ITERATIONS; index++) {
		reply.push(
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
	await tab.ask({ offline: true, calls: true });
	const restore: Sample[] = [];
	for (let index = 0; index < ITERATIONS; index++) {
		let session: ReturnType<Tab['connect']> | undefined;
		restore.push(
			await measure(() => {
				session = tab.connect();
				return next(session.store.read(rows), undefined);
			}),
		);
		session!.close();
	}
	return { reply, restore };
}

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

const tabs = { page: startWorker(false), worker: startWorker(true) } satisfies Record<Lane, Tab>;
const results: Record<
	Lane,
	Record<Step, { busy: number[]; wall: number[]; pageCalls: number[] }>
> = {} as never;
for (const lane of LANES)
	results[lane] = Object.fromEntries(
		STEPS.map((step) => [step, { busy: [], wall: [], pageCalls: [] }]),
	) as never;

for (let index = 0; index < ROUNDS; index++) {
	const order = index % 2 ? [...LANES].reverse() : LANES;
	for (const lane of order) {
		const samples = await round(tabs[lane]);
		for (const step of STEPS) {
			const into = results[lane][step];
			into.busy.push(median(samples[step].map((sample) => sample.busy)));
			into.wall.push(median(samples[step].map((sample) => sample.wall)));
			// Every sample of a step must agree: the count is the step's contract.
			const counts = new Set(samples[step].map((sample) => sample.pageCalls));
			if (counts.size !== 1)
				throw new Error(`${lane} ${step}: page schema calls vary: ${[...counts]}`);
			into.pageCalls.push(samples[step][0]!.pageCalls);
		}
	}
}
const workerCalls = await Promise.all(
	LANES.map((lane) => tabs[lane].ask<{ calls: number; saves: number }>({ calls: true })),
);
for (const tab of Object.values(tabs)) await tab.worker.terminate();

const rowsOut: Array<Record<string, unknown>> = [];
for (const step of STEPS) {
	for (const lane of LANES) {
		const { busy, wall, pageCalls } = results[lane][step];
		rowsOut.push({
			step,
			lane,
			pageCalls: pageCalls[0],
			busyMs: median(busy),
			wallMs: median(wall),
		});
	}
}
const fmt = (value: unknown) => (typeof value === 'number' ? value.toFixed(2) : String(value));
console.log(
	`data-worker-validation: ${COUNT} rows, ${ROUNDS} rounds × ${ITERATIONS} iterations, median of round medians\n`,
);
console.log('| Step | Lane | Tab schema calls | Tab busy (ms) | Wall (ms) | Busy ÷ page |');
console.log('| --- | --- | ---: | ---: | ---: | ---: |');
for (const row of rowsOut) {
	const page = rowsOut.find((other) => other.step === row.step && other.lane === 'page')!;
	console.log(
		`| ${row.step} | ${row.lane} | ${row.pageCalls} | ${fmt(row.busyMs)} | ${fmt(row.wallMs)} | ${fmt((row.busyMs as number) / (page.busyMs as number))} |`,
	);
}
console.log(
	`\nWorker schema calls: page lane ${workerCalls[0]!.calls}, worker lane ${workerCalls[1]!.calls}.` +
		`\nWorker cache saves: page lane ${workerCalls[0]!.saves}, worker lane ${workerCalls[1]!.saves}.`,
);

// The work contract: the worker lane's tab never runs the schema; the page lane's runs it once per value.
for (const step of STEPS) {
	const page = results.page[step].pageCalls[0];
	const worker = results.worker[step].pageCalls[0];
	if (page !== 1 || worker !== 0)
		throw new Error(`${step}: expected tab schema calls page 1, worker 0; got ${page}, ${worker}`);
}
// And the worker runs it once per value only when it validates: a first load, then each step's iterations.
const expected = ROUNDS * (1 + STEPS.length * ITERATIONS);
if (workerCalls[0]!.calls !== 0 || workerCalls[1]!.calls !== expected)
	throw new Error(
		`expected worker schema calls page 0, worker ${expected}; got ${workerCalls[0]!.calls}, ${workerCalls[1]!.calls}`,
	);
if (process.env.BENCH_JSON) {
	const { writeFileSync } = await import('node:fs');
	writeFileSync(
		process.env.BENCH_JSON,
		JSON.stringify({ count: COUNT, rows: rowsOut, workerCalls }, null, 2),
	);
}
