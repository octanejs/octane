/**
 * The Chromium tab: each lane's worker is a dedicated `Worker`
 * (browser-worker.ts). The runner (chromium.ts) calls `__bench.step` and
 * reads the page's main-thread busy time around it over the DevTools
 * protocol; the page records each sample's wall time and schema calls.
 */
import { counter } from './contracts.ts';
import type { Lane, Step } from './report.ts';
import { replies, restores, type Link, type Measure } from './steps.ts';

const search = new URLSearchParams(location.search);
const count = Number(search.get('count'));

function startWorker(validate: boolean): Link {
	const wire = search.get('wire') ?? 'none';
	const worker = new Worker(
		`./browser-worker.js?count=${count}&validate=${validate ? 1 : 0}&wire=${wire}`,
		{
			type: 'module',
		},
	);
	return {
		port() {
			const channel = new MessageChannel();
			worker.postMessage({ port: channel.port1 }, [channel.port1]);
			return { port: channel.port2, close: () => channel.port2.close() };
		},
		ask<T>(message: object) {
			return new Promise<T>((resolve) => {
				worker.addEventListener('message', (event) => resolve(event.data as T), { once: true });
				worker.postMessage(message);
			});
		},
	};
}

const measure: Measure<{ wall: number; pageCalls: number }> = async (run) => {
	const calls = counter.calls;
	const start = performance.now();
	const value = await run();
	const wall = performance.now() - start;
	if (value.length !== count) throw new Error(`expected ${count} rows, got ${value.length}`);
	return { wall, pageCalls: counter.calls - calls };
};

const links = { page: startWorker(false), worker: startWorker(true) } satisfies Record<Lane, Link>;
(globalThis as Record<string, unknown>).__bench = {
	step: (lane: Lane, step: Step, iterations: number) =>
		(step === 'reply' ? replies : restores)(links[lane], iterations, measure),
	stats: (lane: Lane) => links[lane].ask({ calls: true }),
};
