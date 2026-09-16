// Production application-shaped SSR. Browser observations are a separate run;
// this runner never equates render-to-first-chunk with HTTP TTFB or paint.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { buildFixture, readBuild, measurementEnvironment } from './build.mjs';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import { semanticHtmlForVerification } from '../lib/stream-verify.mjs';

const args = process.argv.slice(2);
const iterations = Number(args.find((argument) => /^\d+$/.test(argument)) ?? 30);
assert.ok(Number.isSafeInteger(iterations) && iterations >= 1 && iterations <= 1000);
for (const argument of args)
	assert.ok(
		/^\d+$/.test(argument) || /^--build-dir=.+/.test(argument),
		`Unknown option: ${argument}`,
	);
const suppliedDirectory = args
	.find((argument) => argument.startsWith('--build-dir='))
	?.slice('--build-dir='.length);
const directory = suppliedDirectory
	? path.resolve(suppliedDirectory)
	: fs.mkdtempSync(path.join(os.tmpdir(), 'octane-conversation-bench-'));
const built = suppliedDirectory ? readBuild(directory) : await buildFixture(directory);
assert.equal(
	createHash('sha256')
		.update(fs.readFileSync(path.join(built.root, 'src/data.mjs')))
		.digest('hex'),
	built.provenance.fixtureHashes['src/data.mjs'],
	'The built fixture payload oracle changed',
);
const { scenarioConfig, bodyRows, historyRows } = await import(
	pathToFileURL(path.join(built.root, 'src/data.mjs'))
);
const { handler } = await import(pathToFileURL(path.join(built.distDir, 'server/entry.js')));
const fingerprint = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const verificationSources = Object.fromEntries(
	[
		import.meta.filename,
		path.join(import.meta.dirname, '../lib/stats.mjs'),
		path.join(import.meta.dirname, '../lib/stream-verify.mjs'),
	].map((file) => [file, fingerprint(file)]),
);
const output = {
	suite: 'conversation-streaming',
	iterations,
	targets: [],
	buildDirectory: directory,
	provenance: built.provenance,
	limitations: [
		'Node Web Response consumption from the real production application handler, not HTTP/browser paint latency.',
		'Process CPU includes the same-process response consumer and fixture work; no concurrent task should run during timing.',
		'Delayed workloads include the authored backend schedule. No-delay workloads isolate processing more closely.',
		'Heap deltas and GC activity are not inferred from these timings.',
	],
};
output.verificationSources = verificationSources;
output.measurementEnvironment = measurementEnvironment();
let sequence = 0;
const BODY_MARKER = /data-body(?:[=\s>]|\\")/;
const HISTORY_MARKER = /data-history(?:[=\s>]|\\")/;

async function measure(input, collect = false) {
	const config = scenarioConfig({ ...input, run: `node-${process.pid}-${++sequence}` });
	const controller = new AbortController();
	const request = new Request('http://conversation-benchmark.invalid/conversations', {
		headers: { 'x-conversation-bench': JSON.stringify(config) },
		signal: controller.signal,
	});
	const chunks = [];
	const points = {};
	let bytes = 0;
	let chunkCount = 0;
	let suffix = '';
	const cpu = process.cpuUsage();
	const start = performance.now();
	const response = await handler(request);
	assert.equal(response.status, 200);
	assert.ok(response.body);
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	try {
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			if (next.value.byteLength === 0) continue;
			const at = performance.now();
			points.firstByte ??= at;
			bytes += next.value.byteLength;
			chunkCount++;
			const text = decoder.decode(next.value, { stream: true });
			const searchable = suffix + text;
			if (searchable.includes('data-bench-shell')) points.shell ??= at;
			if (BODY_MARKER.test(searchable)) points.body ??= at;
			if (HISTORY_MARKER.test(searchable)) points.history ??= at;
			suffix = searchable.slice(-128);
			if (collect) chunks.push({ at, text });
		}
	} finally {
		reader.releaseLock();
	}
	const end = performance.now();
	const used = process.cpuUsage(cpu);
	return {
		config,
		start,
		end,
		points,
		bytes,
		chunkCount,
		timings: {
			first_byte: points.firstByte - start,
			shell: points.shell - start,
			body: points.body - start,
			history: points.history - start,
			complete: end - start,
			cpu: (used.user + used.system) / 1000,
		},
		chunks,
	};
}

async function trace(run) {
	const response = await handler(
		new Request(
			'http://conversation-benchmark.invalid/__bench/trace?run=' + encodeURIComponent(run),
		),
	);
	assert.equal(response.status, 200);
	return response.json();
}

async function verifyAbortBeforeAuth() {
	const config = scenarioConfig({ run: `node-abort-${process.pid}`, holdAuth: true });
	const controller = new AbortController();
	const response = await handler(
		new Request('http://conversation-benchmark.invalid/conversations', {
			headers: { 'x-conversation-bench': JSON.stringify(config) },
			signal: controller.signal,
		}),
	);
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	try {
		let shell = '';
		while (!shell.includes('data-bench-shell')) {
			const next = await reader.read();
			assert.equal(next.done, false, 'Aborted control must receive its public shell');
			shell += decoder.decode(next.value, { stream: true });
		}
		assert.ok(!BODY_MARKER.test(shell) && !HISTORY_MARKER.test(shell));
		controller.abort(new Error('Benchmark request canceled before auth'));
		await reader.cancel();
	} finally {
		reader.releaseLock();
	}
	const recorded = await trace(config.run);
	assert.equal(recorded.requests.length, 1);
	const events = recorded.requests[0].events;
	assert.equal(events.filter((event) => event.event === 'request:abort').length, 1);
	assert.ok(
		!events.some((event) => event.event === 'auth:ready' || /^(body|history):/.test(event.event)),
	);
	const release = await handler(
		new Request('http://conversation-benchmark.invalid/__bench/release-auth?run=' + config.run, {
			method: 'POST',
		}),
	);
	assert.equal((await release.json()).released, 0, 'Aborted authorization gate must be released');
	return recorded;
}

function verifyContent(sample) {
	const html = sample.chunks.map((chunk) => chunk.text).join('');
	const semantic = semanticHtmlForVerification('conversation-streaming', html);
	const dom = new JSDOM(semantic);
	try {
		const document = dom.window.document;
		assert.equal(
			document.querySelectorAll('[data-bench-shell]').length,
			1,
			'Expected one public shell',
		);
		assert.ok(document.querySelector('textarea[name="draft"]'), 'Missing early composer');
		if (sample.config.scenario === 'denied') {
			assert.ok(document.querySelector('[data-body-error]'));
			assert.ok(document.querySelector('[data-history-error]'));
			assert.ok(
				!semantic.includes('Private answer ') && !semantic.includes('Private conversation '),
				'Denied auth emitted private data',
			);
			return { denied: true };
		}
		const regions = {};
		for (const [name, rows, rowSelector, fields] of [
			[
				'body',
				bodyRows(sample.config.bodyCount),
				'[data-turn]',
				[
					['id', 'data-turn'],
					['prompt', '[data-prompt]'],
					['answer', '[data-answer]'],
				],
			],
			[
				'history',
				historyRows(sample.config.historyCount),
				'[data-conversation]',
				[
					['id', 'data-conversation'],
					['title', '[data-title]'],
					['preview', '[data-preview]'],
				],
			],
		]) {
			const snapshots = [...document.querySelectorAll(`[data-${name}]`)];
			assert.ok(snapshots.length, `No SSR ${name} snapshot`);
			const last = snapshots.at(-1);
			const revision = Number(last.getAttribute('data-revision'));
			assert.ok(
				Number.isSafeInteger(revision) && revision >= 1 && revision <= sample.config.waves,
				`Invalid ${name} HTML revision`,
			);
			const actualRows = [...last.querySelectorAll(rowSelector)];
			// A stream's first ready HTML is historical presentation. Subsequent
			// values advance the live graph, not dormant DOM on every yield.
			assert.equal(
				actualRows.length,
				Math.ceil((rows.length * revision) / sample.config.waves),
				`Incomplete ${name} HTML snapshot`,
			);
			assert.equal(Number(last.getAttribute('data-total')), rows.length);
			for (const [index, row] of actualRows.entries()) {
				for (const [property, selector] of fields) {
					assert.equal(
						selector.startsWith('[')
							? row.querySelector(selector)?.textContent
							: row.getAttribute(selector),
						rows[index][property],
						`${name} row ${index} ${property}`,
					);
				}
			}
			regions[name] = { snapshots: snapshots.length, rows: actualRows.length, revision };
		}
		return regions;
	} finally {
		dom.window.close();
	}
}

// Independently decode only the fixture's plain-data subset. Do not import the
// product decoder: a shared encoder/decoder mistake must not bless wrong data.
function decodeFixtureValue(encoded) {
	assert.ok(Array.isArray(encoded) && encoded.length === 2, 'Invalid fixture encoding');
	const [kind, value] = encoded;
	if (kind === 'string') {
		assert.equal(typeof value, 'string');
		return value;
	}
	if (kind === 'number') {
		assert.ok(typeof value === 'number' && Number.isFinite(value));
		return value;
	}
	assert.ok(Array.isArray(value));
	if (kind === 'array') return value.map(decodeFixtureValue);
	assert.equal(kind, 'object', 'Unsupported fixture encoding');
	const entries = value.map((entry) => {
		assert.ok(Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string');
		return [entry[0], decodeFixtureValue(entry[1])];
	});
	assert.equal(
		new Set(entries.map(([key]) => key)).size,
		entries.length,
		'Duplicate encoded field',
	);
	return Object.fromEntries(entries);
}

function verifyResultFrames(sample) {
	const html = sample.chunks.map((chunk) => chunk.text).join('');
	const frames = [
		...html.matchAll(/globalThis\.__octaneStreamedRenderer\.receive\(([^]*?)\);<\/script>/g),
	].map((match) => JSON.parse(match[1]));
	const channels = new Map();
	for (const frame of frames) {
		assert.equal(frame.channel, 'result');
		const key = JSON.stringify(frame.identity);
		const channel = channels.get(key) ?? [];
		assert.equal(frame.sequence, channel.length, 'Result sequence gap');
		channel.push(frame);
		channels.set(key, channel);
	}
	if (sample.config.scenario === 'denied') {
		assert.equal(channels.size, 1);
		assert.equal([...channels.values()][0].at(-1).kind, 'error');
		assert.ok(!frames.some((frame) => frame.kind === 'value'));
		return { denied: true };
	}
	assert.equal(channels.size, 3, 'Auth, body and history need independent result channels');
	const actual = [];
	for (const channel of channels.values()) {
		assert.equal(channel[0].kind, 'open');
		assert.equal(channel.at(-1).kind, 'complete', 'Missing result completion');
		assert.ok(channel.slice(1, -1).every((frame) => frame.kind === 'value'));
		actual.push(channel.slice(1, -1).map((frame) => decodeFixtureValue(frame.value)));
	}
	const expected = [
		['authorized'],
		...[bodyRows(sample.config.bodyCount), historyRows(sample.config.historyCount)].map((rows) =>
			Array.from({ length: sample.config.waves }, (_, index) => ({
				revision: index + 1,
				total: rows.length,
				rows: rows.slice(0, Math.ceil((rows.length * (index + 1)) / sample.config.waves)),
			})),
		),
	];
	const canonical = (values) =>
		values
			.map((value) =>
				JSON.stringify(value, (_key, item) =>
					item && !Array.isArray(item) && typeof item === 'object'
						? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
						: item,
				),
			)
			.sort();
	assert.deepEqual(
		canonical(actual),
		canonical(expected),
		'Incomplete or incorrect streamed result payload',
	);
	return {
		channels: channels.size,
		frames: frames.length,
		values: actual.map((values) => values.length).sort(),
	};
}

async function verify(sample) {
	const recorded = await trace(sample.config.run);
	assert.equal(recorded.truncated, false, 'Trace was truncated');
	assert.equal(recorded.requests.length, 1, 'Initial SSR should share one request');
	const events = recorded.requests[0].events;
	const named = (name) => events.filter((event) => event.event === name);
	assert.equal(named('auth:start').length, 1, 'Duplicate auth dependency');
	if (sample.config.scenario === 'denied') {
		assert.equal(named('auth:denied').length, 1);
		assert.equal(named('body:start').length, 0);
		assert.equal(named('history:start').length, 0);
	} else {
		assert.equal(named('auth:ready').length, 1);
		const authorized = named('auth:ready')[0].at;
		for (const region of ['body', 'history']) {
			assert.equal(named(`${region}:start`).length, 1, `Duplicate ${region} job`);
			assert.ok(named(`${region}:start`)[0].at >= authorized, `${region} started before auth`);
			assert.equal(named(`${region}:yield`).length, sample.config.waves);
			assert.equal(named(`${region}:complete`).length, 1);
			assert.ok(sample.points[region] >= authorized, `Private ${region} bytes preceded auth`);
		}
		if (sample.config.latency === 'delayed') {
			assert.ok(sample.points.shell < authorized, 'Shell waited for auth');
			for (const region of ['body', 'history']) {
				const other = region === 'body' ? 'history' : 'body';
				assert.ok(
					named(`${region}:start`)[0].at < named(`${other}:yield`)[0].at,
					'Independent loaders became a waterfall',
				);
			}
			if (sample.config.scenario === 'body-first' || sample.config.scenario === 'history-first') {
				const fast = sample.config.scenario === 'body-first' ? 'body' : 'history';
				const slow = fast === 'body' ? 'history' : 'body';
				assert.ok(
					sample.points[fast] < named(`${slow}:yield`)[0].at,
					'Ready region waited for the slower dependency',
				);
			}
		}
	}
	return { content: verifyContent(sample), results: verifyResultFrames(sample), trace: recorded };
}

try {
	output.abortControl = await verifyAbortBeforeAuth();
	const denied = await measure({ scenario: 'denied' }, true);
	output.deniedControl = await verify(denied);
	for (const input of [
		{ scenario: 'body-first' },
		{ scenario: 'history-first' },
		{ scenario: 'large-waves' },
		{ scenario: 'large-waves', latency: 'none' },
	]) {
		const name = input.scenario + (input.latency === 'none' ? '-cpu' : '');
		console.log(`conversation-streaming/${name}: warming and verifying`);
		for (let i = 0; i < Math.min(5, iterations); i++) await measure(input);
		const control = await measure(input, true);
		const gate = await verify(control);
		fs.writeFileSync(
			path.join(directory, `${name}-control.html`),
			control.chunks.map((chunk) => chunk.text).join(''),
		);
		const samples = [];
		for (let i = 0; i < iterations; i++) {
			const sample = await measure(input);
			for (const value of Object.values(sample.timings))
				assert.ok(Number.isFinite(value) && value >= 0, 'Missing timing marker');
			samples.push({ timings: sample.timings, bytes: sample.bytes, chunks: sample.chunkCount });
		}
		const after = await verify(await measure(input, true));
		output.targets.push({
			name,
			ops: Object.fromEntries(
				Object.keys(samples[0].timings).map((op) => [
					op,
					timingStatForJson(summarizeSamples(samples.map((sample) => sample.timings[op])), {
						p99: true,
					}),
				]),
			),
			meta: {
				config: control.config,
				before: gate,
				after,
				samples,
				assets: built.assets,
				firstShellChunkBytes: Buffer.byteLength(
					control.chunks.find((chunk) => chunk.text.includes('data-bench-shell'))?.text ?? '',
				),
			},
		});
		console.log(
			`${name}: ${output.targets.at(-1).ops.complete.score.toFixed(3)} ms complete; ${output.targets.at(-1).ops.cpu.score.toFixed(3)} ms process CPU`,
		);
	}
	readBuild(directory);
	for (const [file, expected] of Object.entries(verificationSources))
		assert.equal(
			fingerprint(file),
			expected,
			`Verification source changed during measurement: ${file}`,
		);
} catch (error) {
	output.failed = String(error.stack ?? error);
	process.exitCode = 1;
} finally {
	const destination = process.env.BENCH_JSON ?? path.join(directory, 'node-results.json');
	fs.writeFileSync(destination, JSON.stringify(output, null, 2) + '\n');
	console.log(
		JSON.stringify({
			result: destination,
			buildDirectory: directory,
			failed: output.failed ?? null,
		}),
	);
}
