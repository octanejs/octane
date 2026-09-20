// Public result-receiver accounting; instrumentation and assertions are outside timing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { build, version as esbuildVersion } from 'esbuild';
import { summarizeSamples } from '../lib/stats.mjs';

const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		assert.match(arg, /^--(?:output-dir|bundle|iterations|warmup)=.+$/);
		return arg.slice(2).split(/=(.*)/s).slice(0, 2);
	}),
);
assert.ok(args['output-dir'], '--output-dir is required');
const directory = path.resolve(args['output-dir']);
const root = path.resolve(import.meta.dirname, '../..');
assert.ok(!directory.startsWith(root + path.sep), 'Keep generated evidence outside source');
assert.ok(!fs.existsSync(directory), 'Use a fresh output directory');
fs.mkdirSync(directory, { recursive: true });
const iterations = Number(args.iterations ?? 30);
const warmup = Number(args.warmup ?? 10);
for (const value of [iterations, warmup]) assert.ok(Number.isSafeInteger(value) && value > 0);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const bundle = args.bundle ? path.resolve(args.bundle) : path.join(directory, 'receiver.mjs');
if (!args.bundle)
	await build({
		stdin: {
			contents:
				"export { createStreamedResultReceiver } from './packages/octane/src/hydration/index.ts';",
			resolveDir: root,
		},
		bundle: true,
		format: 'esm',
		platform: 'node',
		define: { 'process.env.NODE_ENV': '"production"' },
		outfile: bundle,
	});
const { createStreamedResultReceiver } = await import(pathToFileURL(bundle));
const identity = {
	protocol: 1,
	buildId: 'mailbox-build',
	documentId: 'mailbox-document',
	ownerKey: 'owner',
	instanceKey: 'instance',
	nodeKey: 'answer',
	selectionKey: 'selection',
	selectionGeneration: 1,
	attempt: 1,
};

async function consume(frames, mode) {
	const seen = [];
	let remaining = Infinity;
	const consumer = {
		accept(frame) {
			if (remaining === 0) return false;
			remaining--;
			seen.push(frame);
		},
		fail(error) {
			throw error;
		},
	};
	const start = performance.now();
	const receiver = createStreamedResultReceiver(identity);
	try {
		receiver.registerSelection(identity);
		if (mode === 'immediate') receiver.attachResult(identity, consumer);
		for (const frame of frames) await receiver.receive(frame);
		for (let drain = 0; drain < frames.length && seen.length < frames.length; drain++) {
			remaining = mode === 'partial' ? 1 : Infinity;
			receiver.attachResult(identity, consumer)();
		}
	} finally {
		receiver.dispose();
	}
	return { seen, elapsedMs: performance.now() - start };
}

async function counted(frames, mode) {
	const stringify = JSON.stringify;
	const encode = TextEncoder.prototype.encode;
	const counts = {
		frameStringify: 0,
		stringifyCharacters: 0,
		encodeCalls: 0,
		encodedAllocationBytes: 0,
	};
	JSON.stringify = function (...values) {
		const result = Reflect.apply(stringify, JSON, values);
		if (values[0]?.channel === 'result') {
			counts.frameStringify++;
			counts.stringifyCharacters += result.length;
		}
		return result;
	};
	TextEncoder.prototype.encode = function (value) {
		const result = Reflect.apply(encode, this, [value]);
		counts.encodeCalls++;
		counts.encodedAllocationBytes += result.byteLength;
		return result;
	};
	try {
		return { counts, run: await consume(frames, mode) };
	} finally {
		JSON.stringify = stringify;
		TextEncoder.prototype.encode = encode;
	}
}

const result = {
	suite: 'result-mailbox',
	iterations,
	warmup,
	esbuildVersion,
	checkoutHead: execFileSync('git', ['rev-parse', 'HEAD'], {
		cwd: root,
		encoding: 'utf8',
	}).trim(),
	builtFromCheckout: !args.bundle,
	bundle,
	bundleHash: hash(fs.readFileSync(bundle)),
	probeHash: hash(fs.readFileSync(import.meta.filename)),
	environment: {
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		cpu: os.cpus()[0]?.model,
		at: new Date().toISOString(),
	},
	limitations: [
		'Node receiver lifecycle, not browser/network latency or total allocation.',
		'Counters use a separate untimed run; supplied bundle provenance is its content hash.',
	],
	workloads: [],
};
for (const [name, text] of [
	['ascii', 'Finite answer. '],
	['unicode', '会話 café 😀 '],
]) {
	const bodies = [
		{ kind: 'open', resource: 'stream' },
		...Array.from({ length: 62 }, (_, i) => ({
			kind: 'value',
			value: ['string', text.repeat((i + 1) * 8)],
		})),
		{ kind: 'complete' },
	];
	const frames = bodies.map((body, sequence) => ({
		identity,
		sequence,
		channel: 'result',
		...body,
	}));
	const oracle = structuredClone(frames);
	for (const mode of ['partial', 'full', 'immediate']) {
		const measured = await counted(frames, mode);
		assert.deepEqual(measured.run.seen, oracle);
		for (let i = 0; i < warmup; i++) assert.deepEqual((await consume(frames, mode)).seen, oracle);
		const samples = [];
		for (let i = 0; i < iterations; i++) {
			const run = await consume(frames, mode);
			assert.deepEqual(run.seen, oracle);
			samples.push(run.elapsedMs);
		}
		const entry = {
			name: `${name}-${mode}`,
			frames: frames.length,
			outputHash: hash(JSON.stringify(oracle)),
			counts: measured.counts,
			samples,
			elapsedMs: summarizeSamples(samples),
		};
		result.workloads.push(entry);
		console.log(
			JSON.stringify({ name: entry.name, counts: entry.counts, medianMs: entry.elapsedMs.median }),
		);
	}
}
fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(result, null, 2));
