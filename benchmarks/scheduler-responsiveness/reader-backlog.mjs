// Direct buffered transport consumers, independent of render scheduling. Production code,
// ordered frames, marker responsiveness, and full completion on the same host.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repository = path.resolve(import.meta.dirname, '../..');
const source = path.resolve(
	process.argv.find((arg, i) => i > 1 && !arg.startsWith('--')) ?? repository,
);
const report = process.argv.includes('--report');
const dependencies = createRequire(path.join(repository, 'packages/octane/package.json'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-reader-backlog-'));
const outfile = path.join(scratch, 'runtime.mjs');
await build({
	stdin: {
		contents: `export {readServerResult} from ${JSON.stringify(path.join(source, 'packages/octane/src/server-rpc-stream-client.ts'))}; export {encodeServerResultFrame} from ${JSON.stringify(path.join(source, 'packages/octane/src/server-rpc-protocol.ts'))}; export {readStreamedRendererResponse} from ${JSON.stringify(path.join(source, 'packages/octane/src/hydration/stream-delivery.ts'))};`,
		loader: 'ts',
		resolveDir: source,
	},
	outfile,
	bundle: true,
	format: 'esm',
	platform: 'browser',
	minify: true,
	define: { 'process.env.NODE_ENV': '"production"' },
	alias: { devalue: dependencies.resolve('devalue') },
});
const runtime = await import(pathToFileURL(outfile).href);
function task(callback) {
	const channel = new MessageChannel();
	channel.port1.onmessage = () => {
		channel.port1.close();
		channel.port2.close();
		callback();
	};
	channel.port2.postMessage(null);
}
function burn(ms) {
	const start = performance.now();
	while (performance.now() - start < ms) {}
}
function rpcResponse(count) {
	const frames = [
		{ kind: 'stream' },
		...Array.from({ length: count }, (_, value) => ({ kind: 'value', value })),
		{ kind: 'complete' },
	];
	return new Response(
		Buffer.concat(
			frames.map((frame, sequence) => runtime.encodeServerResultFrame(sequence, frame)),
		),
	);
}
async function measure(kind) {
	const count = 32;
	const values = [];
	let release;
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	let work;
	if (kind === 'renderer-gated') {
		const identity = {
			protocol: 1,
			buildId: 'build',
			documentId: 'document',
			ownerKey: 'owner',
			instanceKey: 'instance',
			nodeKey: 'node',
			selectionKey: 'selection',
			selectionGeneration: 0,
			attempt: 0,
		};
		const frames = [
			{ kind: 'open', resource: 'stream' },
			...Array.from({ length: count }, (_, value) => ({ kind: 'value', value: ['number', value] })),
			{ kind: 'complete' },
		].map((frame, sequence) => ({ ...frame, identity, sequence, channel: 'result' }));
		work = runtime.readStreamedRendererResponse(
			new Response(frames.map((frame) => JSON.stringify(frame) + '\n').join('')),
			{
				async receive(frame) {
					if (frame.kind === 'open') await gate;
					if (frame.kind === 'value') {
						values.push(frame.value[1]);
						burn(2);
					}
					return 'accepted';
				},
				failSelection() {
					return true;
				},
			},
		);
		// All frames can enter the bounded delivery window while the first
		// acknowledgement waits. Measure releasing that already-queued backlog.
		await new Promise((resolve) => task(resolve));
	} else {
		work = gate.then(async () => {
			const iterable = await runtime.readServerResult(rpcResponse(count));
			for await (const value of iterable) {
				values.push(value);
				burn(2);
			}
		});
	}
	const start = performance.now();
	const marker = new Promise((resolve) =>
		task(() =>
			resolve({ values: values.length, afterMs: +(performance.now() - start).toFixed(2) }),
		),
	);
	release();
	await work;
	const completionMs = +(performance.now() - start).toFixed(2);
	const beforeMarker = await marker;
	assert.deepEqual(
		values,
		Array.from({ length: count }, (_, i) => i),
	);
	if (!report)
		assert.ok(beforeMarker.values < count, `${kind} must yield before exhausting buffered work`);
	return { kind, count, subscriberMs: 2, beforeMarker, completionMs };
}
try {
	for (const kind of ['rpc', 'renderer-gated']) console.log(JSON.stringify(await measure(kind)));
} finally {
	fs.rmSync(scratch, { recursive: true, force: true });
}
