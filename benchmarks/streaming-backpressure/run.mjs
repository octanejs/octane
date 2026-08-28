process.env.NODE_ENV = 'production';

import { once } from 'node:events';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import { verifyStream } from '../lib/stream-verify.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, '../streaming-ssr');
const streamRequire = createRequire(path.join(FIXTURES, 'package.json'));
const { build } = await import(pathToFileURL(streamRequire.resolve('vite')).href);
const TARGETS = [
	{ name: 'octane-tsrx', directory: 'octane' },
	{ name: 'react', directory: 'react' },
	{ name: 'preact', directory: 'preact' },
	{ name: 'solid', directory: 'solid' },
	{ name: 'inferno', directory: 'inferno' },
];
const iterations = Number.parseInt(process.argv[2] ?? '5', 10);

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Streaming backpressure iterations must be a positive integer');
}

async function loadTarget(target) {
	// Keep built entries under the fixture workspace so externalized framework
	// packages resolve through streaming-ssr's declared dependencies.
	const directory = path.join(FIXTURES, 'dist', 'backpressure', target.name);
	await build({
		root: path.join(FIXTURES, target.directory),
		logLevel: 'warn',
		build: { ssr: 'src/entry-server.ts', outDir: directory, emptyOutDir: true },
		ssr: { noExternal: ['@tsrx/react'] },
	});
	return import(pathToFileURL(path.join(directory, 'entry-server.js')).href);
}

async function collectSlowStream(module, name, { abort = false } = {}) {
	const chunks = [];
	let backpressureSignals = 0;
	let aborted = false;
	const started = performance.now();
	let handle;
	const destination = new Writable({
		highWaterMark: 1,
		write(chunk, _encoding, callback) {
			chunks.push({ html: chunk.toString(), time: performance.now() - started });
			if (abort && chunks.length === 1 && typeof handle?.abort === 'function') {
				queueMicrotask(() => {
					aborted = true;
					handle.abort(new Error('Benchmark client disconnected'));
				});
			}
			setTimeout(callback, 4);
		},
	});
	const originalWrite = destination.write.bind(destination);
	destination.write = (...args) => {
		const accepted = originalWrite(...args);
		if (!accepted) backpressureSignals++;
		return accepted;
	};
	const errors = [];
	handle = module.createBenchmarkStream('staggered', {
		onError: (error) => errors.push(error instanceof Error ? error.message : String(error)),
		onShellError: (error) => errors.push(error instanceof Error ? error.message : String(error)),
	});
	const finished = once(destination, 'finish').then(
		() => true,
		() => false,
	);
	handle.pipe(destination);
	let ended;
	if (abort) {
		ended = await Promise.race([
			finished,
			new Promise((resolve) => setTimeout(() => resolve(false), 250)),
		]);
		if (!ended && !destination.destroyed) {
			const closed = once(destination, 'close');
			destination.destroy();
			await closed;
		}
	} else {
		ended = await finished;
		if (!ended) throw new Error(`${name}: the slow streaming destination closed prematurely`);
	}
	const total = performance.now() - started;
	if (chunks.length === 0) throw new Error(`${name}: a streaming destination received no shell`);
	if (backpressureSignals === 0) {
		throw new Error(`${name}: the one-byte destination never exerted real backpressure`);
	}
	const html = chunks.map((chunk) => chunk.html).join('');
	if (!abort) {
		verifyStream(name, 'staggered', { html, firstChunk: chunks[0].html, total }, 10);
	}
	if (abort && typeof handle.abort === 'function' && !aborted) {
		throw new Error(`${name}: the streaming abort handle was never invoked`);
	}
	return {
		aborted,
		abortSupported: typeof handle.abort === 'function',
		backpressureSignals,
		bytes: Buffer.byteLength(html),
		chunks: chunks.length,
		ended,
		errors,
		shell: chunks[0].time,
		total,
	};
}

const results = [];
let failure;

for (const target of TARGETS) {
	try {
		const module = await loadTarget(target);
		if (typeof module.createBenchmarkStream !== 'function') {
			throw new Error('the built fixture does not expose a real pipeable stream');
		}
		const slow = [];
		const shell = [];
		let latest;
		for (let index = 0; index < iterations; index++) {
			latest = await collectSlowStream(module, target.name);
			slow.push(latest.total);
			shell.push(latest.shell);
		}
		const concurrentStarted = performance.now();
		const concurrent = await Promise.all(
			Array.from({ length: 3 }, () => collectSlowStream(module, target.name)),
		);
		const concurrentElapsed = performance.now() - concurrentStarted;
		const aborted = latest.abortSupported
			? await collectSlowStream(module, target.name, { abort: true })
			: null;
		results.push({
			name: target.name,
			ops: {
				slow_shell: timingStatForJson(summarizeSamples(shell), { p99: true }),
				slow_destination: timingStatForJson(summarizeSamples(slow), { p99: true }),
				concurrent_streams: timingStatForJson(summarizeSamples([concurrentElapsed]), { p99: true }),
			},
			meta: {
				abortSupported: latest.abortSupported,
				aborted: aborted?.aborted ?? false,
				abortErrors: aborted?.errors ?? [],
				backpressureSignals: latest.backpressureSignals,
				bytes: latest.bytes,
				chunks: latest.chunks,
				concurrentStreams: concurrent.length,
				correctness: 'pass',
				highWaterMark: 1,
			},
		});
		console.log(
			`PASS streaming-backpressure/${target.name}: real drain, three concurrent streams, abort=${latest.abortSupported}`,
		);
	} catch (error) {
		failure = `${target.name}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`;
		console.error(`FAIL streaming-backpressure/${failure}`);
		break;
	}
}

const payload = {
	suite: 'streaming-backpressure',
	iterations,
	targets: results,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
