// Focused Node transport probe, separate from browser/HTTP and compression timing.
// node benchmarks/conversation-streaming/stream-delivery.mjs --output-dir=/absolute/new-dir
// Reuse a recorded bundle with --bundle=/absolute/prior-dir/server.mjs for matched comparisons.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build, version as esbuildVersion } from 'esbuild';
import { summarizeSamples } from '../lib/stats.mjs';

const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		if (arg === '--without-buffer') return ['without-buffer', true];
		assert.match(arg, /^--(?:output-dir|bundle|iterations|warmup)=.+$/);
		return arg.slice(2).split(/=(.*)/s).slice(0, 2);
	}),
);
assert.ok(args['output-dir'], '--output-dir is required; generated evidence stays outside source');
const directory = path.resolve(args['output-dir']);
assert.ok(!fs.existsSync(directory), 'Use a fresh output directory');
fs.mkdirSync(directory, { recursive: true });
const iterations = Number(args.iterations ?? 30);
const warmup = Number(args.warmup ?? 10);
for (const value of [iterations, warmup]) assert.ok(Number.isSafeInteger(value) && value > 0);
const root = path.resolve(import.meta.dirname, '../..');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const bundle = args.bundle ? path.resolve(args.bundle) : path.join(directory, 'server.mjs');
let source;
if (args.bundle) {
	source = JSON.parse(fs.readFileSync(path.join(path.dirname(bundle), 'source.json'), 'utf8'));
	assert.equal(hash(fs.readFileSync(bundle)), source.bundleHash);
} else {
	const built = await build({
		stdin: {
			contents: `export {renderToReadableStream, enableServerSignalBindings, createStreamedSignalInjection} from './packages/octane/src/server/index.ts';
export {query$} from './packages/octane/src/signals/index.ts';
export {decodeSignalValue} from './packages/octane/src/data-encoding.ts';
export {decodeStreamedRendererFrame} from './packages/octane/src/streamed-signals-protocol.ts';`,
			resolveDir: root,
		},
		bundle: true,
		format: 'esm',
		platform: 'node',
		metafile: true,
		define: { 'process.env.NODE_ENV': '"production"' },
		outfile: bundle,
	});
	source = {
		head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
		bundleHash: hash(fs.readFileSync(bundle)),
		esbuildVersion,
		inputs: Object.fromEntries(
			Object.keys(built.metafile.inputs)
				.filter((file) => file !== '<stdin>')
				.map((file) => [file, hash(fs.readFileSync(path.resolve(root, file)))]),
		),
	};
	fs.writeFileSync(path.join(directory, 'source.json'), JSON.stringify(source, null, 2));
}
const runtime = await import(pathToFileURL(bundle));
runtime.enableServerSignalBindings();
const nonce = 'bench-"<&>';
const buildId = 'stream-delivery-build';
const documentId = 'stream-delivery-document';
const ascii = 'A finite answer grows by one useful word. ';
const unicode = '会話の回答 grows café 😀 & <tag>\u2028\u2029. ';
const growing = (part) =>
	Array.from({ length: 200 }, (_, i) => ({ role: 'assistant', content: part.repeat(i + 1) }));
const workloads = [
	{ name: 'growing-ascii', channels: [growing(ascii)] },
	{ name: 'growing-unicode', channels: [growing(unicode)] },
	{
		name: 'constant-whole-value',
		channels: [
			Array.from({ length: 200 }, () => ({ role: 'assistant', content: unicode.repeat(5) })),
		],
	},
	{
		name: 'multi-channel',
		channels: Array.from({ length: 128 }, (_, channel) =>
			Array.from({ length: 4 }, (_, update) => ({ channel, update, content: 'ready' })),
		),
	},
	{ name: 'primitive-control', channels: [Array.from({ length: 200 }, (_, i) => i)] },
	{ name: 'explicit-injection', channels: [growing(ascii)], explicit: true },
	{ name: 'terminal-error', channels: [['first', 'second']], error: true },
	{ name: 'feature-free', channels: [] },
];

async function consume(workload, collect) {
	const nativeBuffer = globalThis.Buffer;
	if (args['without-buffer']) globalThis.Buffer = undefined;
	try {
		return await consumeWithBuffer(workload, collect, nativeBuffer);
	} finally {
		globalThis.Buffer = nativeBuffer;
	}
}

async function consumeWithBuffer(workload, collect, nativeBuffer) {
	const cpu = process.cpuUsage();
	const start = performance.now();
	const channels = workload.channels.map((values, index) =>
		runtime.query$(
			() => index,
			async function* () {
				for (const value of values) yield value;
				if (workload.error) throw new Error('private producer failure');
			},
			{ key: `stream-delivery-${index}` },
		),
	);
	const options = { nonce };
	if (workload.explicit) {
		options.injection = runtime.createStreamedSignalInjection(
			{
				protocol: 1,
				buildId,
				documentId,
				ownerKey: 'owner',
				instanceKey: 'instance',
				nodeKey: 'stream-delivery-0',
				selectionKey: 'selection',
				selectionGeneration: 7,
				attempt: 1,
			},
			(async function* () {
				yield* workload.channels[0];
			})(),
			{ nonce, announceSelection: true },
		);
	} else if (channels.length) {
		options.streamedSignals = { buildId, documentId, selectionGeneration: 7 };
	}
	const chunks = [];
	let bytes = 0;
	let chunkCount = 0;
	const stream = await runtime.renderToReadableStream(
		() => {
			if (!workload.explicit) for (const channel of channels) channel.snapshot();
			return 'Finite answer shell';
		},
		undefined,
		options,
	);
	const reader = stream.getReader();
	let firstChunkMs;
	try {
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			firstChunkMs ??= performance.now() - start;
			bytes += next.value.byteLength;
			chunkCount++;
			if (collect) chunks.push(next.value);
		}
	} finally {
		reader.releaseLock();
	}
	const elapsedMs = performance.now() - start;
	const used = process.cpuUsage(cpu);
	return {
		elapsedMs,
		firstChunkMs,
		cpuMs: (used.user + used.system) / 1000,
		bytes,
		chunkCount,
		...(collect ? { html: nativeBuffer.concat(chunks).toString('utf8') } : {}),
	};
}

async function counted(workload) {
	const stringify = JSON.stringify;
	const Encoder = globalThis.TextEncoder;
	const encode = Encoder.prototype.encode;
	const descriptor = Object.getOwnPropertyDescriptor;
	const nativeBuffer = globalThis.Buffer;
	const byteLength = nativeBuffer.byteLength;
	const counts = {
		stringify: 0,
		stringifyCharacters: 0,
		frameStringify: 0,
		encoderConstructors: 0,
		encodeCalls: 0,
		encodedAllocationBytes: 0,
		bufferByteLengthCalls: 0,
		descriptors: 0,
	};
	nativeBuffer.byteLength = function (...values) {
		counts.bufferByteLengthCalls++;
		return Reflect.apply(byteLength, nativeBuffer, values);
	};
	JSON.stringify = function (...values) {
		const result = Reflect.apply(stringify, JSON, values);
		counts.stringify++;
		counts.stringifyCharacters += result?.length ?? 0;
		if (values[0]?.channel === 'result') counts.frameStringify++;
		return result;
	};
	globalThis.TextEncoder = class extends Encoder {
		constructor() {
			super();
			counts.encoderConstructors++;
		}
	};
	Encoder.prototype.encode = function (value) {
		const result = Reflect.apply(encode, this, [value]);
		counts.encodeCalls++;
		counts.encodedAllocationBytes += result.byteLength;
		return result;
	};
	Object.getOwnPropertyDescriptor = function (...values) {
		counts.descriptors++;
		return Reflect.apply(descriptor, Object, values);
	};
	try {
		return { counts, run: await consume(workload, true) };
	} finally {
		JSON.stringify = stringify;
		globalThis.TextEncoder = Encoder;
		Encoder.prototype.encode = encode;
		Object.getOwnPropertyDescriptor = descriptor;
		nativeBuffer.byteLength = byteLength;
	}
}

const escapeJSON = (value) =>
	JSON.stringify(value).replace(
		/[&<>\u2028\u2029]/g,
		(character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
	);
function verify(workload, html) {
	assert.ok(html.includes('Finite answer shell'));
	assert.ok(!html.includes('private producer failure'));
	const matches = [
		...html.matchAll(
			/<script\b[^>]*>globalThis\.__octaneStreamedRenderer\.receive\((.*?)\);<\/script>/gs,
		),
	];
	const perChannel = new Map();
	const wire = {
		raw: Buffer.byteLength(html),
		valueJSON: 0,
		identityJSON: 0,
		frameMetadata: 0,
		scriptFraming: 0,
		other: 0,
	};
	for (const match of matches) {
		assert.ok(match[0].includes('nonce="bench-&quot;&lt;&amp;&gt;"'));
		assert.ok(!/[<>&\u2028\u2029]/.test(match[1]), 'Inline frame contents must be escaped');
		const frame = runtime.decodeStreamedRendererFrame(match[1]);
		assert.equal(frame.channel, 'result');
		assert.equal(frame.identity.buildId, buildId);
		assert.equal(frame.identity.documentId, documentId);
		assert.equal(frame.identity.selectionGeneration, 7);
		assert.equal(frame.identity.attempt, 1);
		const index = Number(frame.identity.nodeKey.match(/stream-delivery-(\d+)$/)?.[1]);
		assert.ok(Number.isInteger(index) && index < workload.channels.length);
		const channel = perChannel.get(index) ?? { identity: frame.identity, frames: [] };
		assert.deepEqual(frame.identity, channel.identity);
		assert.equal(frame.sequence, channel.frames.length);
		channel.frames.push(frame);
		perChannel.set(index, channel);
		const frameBytes = Buffer.byteLength(match[1]);
		const identityBytes = Buffer.byteLength(escapeJSON(frame.identity));
		const valueBytes = frame.kind === 'value' ? Buffer.byteLength(escapeJSON(frame.value)) : 0;
		wire.identityJSON += identityBytes;
		wire.valueJSON += valueBytes;
		wire.frameMetadata += frameBytes - identityBytes - valueBytes;
		wire.scriptFraming += Buffer.byteLength(match[0]) - frameBytes;
	}
	assert.equal(perChannel.size, workload.channels.length);
	for (const [index, channel] of perChannel) {
		assert.equal(channel.frames[0].kind, 'open');
		assert.equal(channel.frames[0].resource, 'stream');
		assert.equal(channel.frames.at(-1).kind, workload.error ? 'error' : 'complete');
		if (workload.error) assert.equal(channel.frames.at(-1).code, 'SERVER_RESULT_FAILED');
		assert.deepEqual(
			channel.frames.slice(1, -1).map((frame) => {
				assert.equal(frame.kind, 'value');
				return runtime.decodeSignalValue(frame.value);
			}),
			workload.channels[index],
		);
	}
	wire.other =
		wire.raw - wire.valueJSON - wire.identityJSON - wire.frameMetadata - wire.scriptFraming;
	wire.gzip = gzipSync(html, { level: 9 }).byteLength;
	wire.brotli = brotliCompressSync(html, {
		params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
	}).byteLength;
	return {
		channels: perChannel.size,
		values: workload.channels.reduce((sum, channel) => sum + channel.length, 0),
		frames: matches.length,
		wire,
		outputHash: hash(html),
	};
}

const result = {
	suite: 'stream-delivery',
	source,
	iterations,
	warmup,
	withoutBuffer: args['without-buffer'] === true,
	probeHash: hash(fs.readFileSync(import.meta.filename)),
	environment: {
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		cpu: os.cpus()[0]?.model,
		at: new Date().toISOString(),
	},
	limitations: [
		'Node render-to-readable-stream and same-process consumer; not network or browser latency.',
		'Instrumentation is a separate untimed run. TextEncoder allocation bytes exclude other allocation classes.',
		'Compression measures the complete response with fixed settings; it excludes HTTP headers and streaming flush behavior.',
		'Whole values and every accepted update are retained; prefix repetition is intentional workload cost.',
	],
	workloads: [],
};
for (const workload of workloads) {
	const instrumented = await counted(workload);
	const oracle = verify(workload, instrumented.run.html);
	fs.writeFileSync(path.join(directory, `${workload.name}.html`), instrumented.run.html);
	for (let i = 0; i < warmup; i++) await consume(workload, false);
	const samples = [];
	for (let i = 0; i < iterations; i++) samples.push(await consume(workload, false));
	for (const sample of samples) assert.equal(sample.bytes, oracle.wire.raw);
	const entry = {
		name: workload.name,
		...oracle,
		counts: instrumented.counts,
		samples,
		elapsedMs: summarizeSamples(samples.map((sample) => sample.elapsedMs)),
		cpuMs: summarizeSamples(samples.map((sample) => sample.cpuMs)),
	};
	result.workloads.push(entry);
	console.log(
		JSON.stringify({
			name: entry.name,
			values: entry.values,
			rawBytes: entry.wire.raw,
			counts: entry.counts,
			medianMs: entry.elapsedMs.median,
			medianCpuMs: entry.cpuMs.median,
		}),
	);
}
fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(result, null, 2));
