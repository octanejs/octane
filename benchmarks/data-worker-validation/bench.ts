/**
 * The Node runner: the tab is the main thread, and each lane's worker a
 * worker thread (worker.ts). A step records the tab's busy time from
 * `performance.eventLoopUtilization`, which leaves out time spent waiting
 * for the worker. See README.md.
 */
import { performance } from 'node:perf_hooks';
import { MessageChannel, Worker } from 'node:worker_threads';
import { counter } from './contracts.ts';
import { LANES, add, report, type Lane, type Sample, type WorkerStats } from './report.ts';
import { replies, restores, type Link, type Measure } from './steps.ts';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const ROUNDS = Number(args.find((arg) => /^\d+$/.test(arg)) ?? (quick ? 2 : 8));
const ITERATIONS = quick ? 5 : 20;
const COUNT = Number(process.env.ROWS ?? 5000);

function startWorker(validate: boolean): Link & { worker: Worker } {
	const worker = new Worker(new URL('./worker.mjs', import.meta.url), {
		workerData: { count: COUNT, validate },
	});
	return {
		worker,
		port() {
			const channel = new MessageChannel();
			worker.postMessage({ port: channel.port1 }, [channel.port1]);
			return { port: channel.port2 as never, close: () => channel.port2.close() };
		},
		ask<T>(message: object) {
			return new Promise<T>((resolve) => {
				worker.once('message', resolve);
				worker.postMessage(message);
			});
		},
	};
}

const measure: Measure<Sample> = async (run) => {
	const calls = counter.calls;
	const elu = performance.eventLoopUtilization();
	const start = performance.now();
	const value = await run();
	const wall = performance.now() - start;
	const busy = performance.eventLoopUtilization(elu).active;
	if (value.length !== COUNT) throw new Error(`expected ${COUNT} rows, got ${value.length}`);
	return { busy, wall, pageCalls: counter.calls - calls };
};

const links = { page: startWorker(false), worker: startWorker(true) } satisfies Record<Lane, Link>;
for (let index = 0; index < ROUNDS; index++) {
	for (const lane of index % 2 ? [...LANES].reverse() : LANES) {
		add(lane, 'reply', await replies(links[lane], ITERATIONS, measure));
		add(lane, 'restore', await restores(links[lane], ITERATIONS, measure));
	}
}
const workers = {
	page: await links.page.ask<WorkerStats>({ calls: true }),
	worker: await links.worker.ask<WorkerStats>({ calls: true }),
};
for (const link of Object.values(links)) await link.worker.terminate();
report({ title: 'Node', count: COUNT, rounds: ROUNDS, iterations: ITERATIONS, workers });
