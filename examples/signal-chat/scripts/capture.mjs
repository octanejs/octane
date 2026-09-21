// Capture observable application HTML over real loopback HTTP. This does not
// parse Octane's private wire protocol or measure browser display/hydration.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), '../../..');
const usage = `Capture Signal Chat SSR responses and producer traces.

Usage:
  node examples/signal-chat/scripts/capture.mjs --output=/absolute/new-directory
  node examples/signal-chat/scripts/capture.mjs --url=http://127.0.0.1:5237/?scenario=unicode --runs=3 --output=/absolute/new-directory

Options:
  --url=URL         Loopback HTTP document URL (default http://127.0.0.1:5237/).
  --runs=N          Recorded sequential requests, 1–1000 (default 3).
  --warmup=N        Separate archived warmup requests, 0–100 (default 1).
  --timeout-ms=N    Deadline for each document or trace, 1–180000 (default 30000).
  --output=PATH     Required absolute, fresh directory outside this repository.
  --help            Show usage.

Every request keeps the same query parameters except a fresh run ID. For an
eager/deferred comparison, capture /eager and / in separate directories with
identical scenario settings; compare equivalent complete work and timing ranges.
`;

function parseOptions(args) {
	const options = {
		url: 'http://127.0.0.1:5237/',
		runs: 3,
		warmup: 1,
		timeoutMs: 30000,
		output: null,
	};
	const seen = new Set();
	for (const argument of args) {
		const match = /^--(url|runs|warmup|timeout-ms|output)=(.+)$/.exec(argument);
		assert.ok(match, `Unknown or incomplete option: ${argument}`);
		const [, name, value] = match;
		assert.ok(!seen.has(name), `Duplicate option: --${name}`);
		seen.add(name);
		if (name === 'url' || name === 'output') options[name] = value;
		else {
			assert.ok(/^\d+$/.test(value), `--${name} must be an integer`);
			options[name === 'timeout-ms' ? 'timeoutMs' : name] = Number(value);
		}
	}
	for (const [name, minimum, maximum] of [
		['runs', 1, 1000],
		['warmup', 0, 100],
		['timeoutMs', 1, 180000],
	]) {
		assert.ok(
			Number.isSafeInteger(options[name]) && options[name] >= minimum && options[name] <= maximum,
			`${name} must be between ${minimum} and ${maximum}`,
		);
	}
	const url = new URL(options.url);
	const hostname = url.hostname.replace(/^\[|\]$/g, '');
	const loopback =
		hostname === 'localhost' || hostname === '::1' || /^127(?:\.\d{1,3}){3}$/.test(hostname);
	assert.ok(url.protocol === 'http:' && loopback, '--url must use loopback HTTP');
	assert.ok(!url.username && !url.password, '--url must not contain credentials');
	url.hash = '';
	url.searchParams.delete('run');
	assert.ok(options.output && path.isAbsolute(options.output), '--output must be absolute');
	options.output = path.resolve(options.output);
	const relativeOutput = path.relative(repositoryRoot, options.output);
	assert.ok(
		relativeOutput.startsWith('..' + path.sep) || path.isAbsolute(relativeOutput),
		'--output must be outside this repository',
	);
	return { ...options, url: url.href };
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';

async function writeJson(output, name, value) {
	await writeFile(path.join(output, name), json(value), { flag: 'wx' });
}

function git(args) {
	return execFileSync('git', args, {
		cwd: repositoryRoot,
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	}).trimEnd();
}

async function sourceSnapshot() {
	const scopes = [
		'examples/signal-chat',
		'packages/octane/src',
		'packages/app-core/src',
		'packages/vite-plugin-octane/src',
		'package.json',
		'pnpm-lock.yaml',
		'pnpm-workspace.yaml',
	];
	const paths = git([
		'ls-files',
		'-z',
		'--cached',
		'--others',
		'--exclude-standard',
		'--',
		...scopes,
	])
		.split('\0')
		.filter(Boolean);
	const files = [];
	for (const name of [...new Set(paths)].sort()) {
		try {
			const data = await readFile(path.join(repositoryRoot, name));
			files.push({ path: name, bytes: data.byteLength, sha256: sha256(data) });
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
			files.push({ path: name, deleted: true });
		}
	}
	const status = git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...scopes]);
	const records = status.split('\0').filter(Boolean);
	const changedFiles = [];
	for (let index = 0; index < records.length; index++) {
		const record = records[index];
		const status = record.slice(0, 2);
		const name = record.slice(3);
		const previousPath = /[RC]/.test(status) ? records[++index] : undefined;
		changedFiles.push({
			status,
			path: name,
			...(previousPath ? { previousPath } : {}),
			...(files.find((file) => file.path === name) ?? { deleted: true }),
		});
	}
	return {
		gitHead: git(['rev-parse', 'HEAD']),
		gitBranch: git(['branch', '--show-current']),
		scopes,
		changedFiles,
		files,
		manifestSha256: sha256(json(files)),
	};
}

function deadline(timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(
		() => controller.abort(new Error(`Response exceeded ${timeoutMs} ms deadline`)),
		timeoutMs,
	);
	timer.unref();
	return { controller, stop: () => clearTimeout(timer) };
}

async function fetchTrace(url, run, timeoutMs) {
	const traceUrl = new URL('/__lab/trace', url);
	traceUrl.searchParams.set('run', run);
	const timer = deadline(timeoutMs);
	try {
		const response = await fetch(traceUrl, {
			signal: timer.controller.signal,
			redirect: 'error',
			cache: 'no-store',
			headers: { accept: 'application/json', 'accept-encoding': 'identity' },
		});
		assert.equal(response.status, 200, `Trace returned HTTP ${response.status}`);
		return await response.json();
	} finally {
		timer.stop();
	}
}

function validateTrace(trace, sample) {
	assert.equal(trace.run, sample.run, 'Trace run does not match request');
	assert.equal(trace.truncated, false, 'Trace is missing or truncated');
	assert.ok(Array.isArray(trace.events), 'Trace has no event list');
	const scenarios = ['steady', 'burst', 'unicode', 'empty', 'fail-before', 'fail-after'];
	assert.ok(scenarios.includes(trace.scenario), `Unknown trace scenario: ${trace.scenario}`);
	const expectedScenario = new URL(sample.url).searchParams.get('scenario') ?? 'steady';
	assert.equal(trace.scenario, expectedScenario, 'Trace scenario does not match request');
	const rawWaves = new URL(sample.url).searchParams.get('waves');
	assert.ok(rawWaves === null || rawWaves === '' || /^\d+$/.test(rawWaves), 'Invalid waves');
	const parsedWaves = rawWaves === null || rawWaves === '' ? 8 : Number(rawWaves);
	assert.ok(Number.isSafeInteger(parsedWaves), 'Invalid waves');
	const waves = Math.max(1, Math.min(64, parsedWaves));
	const expected = {
		session: { terminal: 'complete', yields: 0 },
		answer: {
			terminal: trace.scenario.startsWith('fail-') ? 'error' : 'complete',
			yields: ['empty', 'fail-before'].includes(trace.scenario)
				? 0
				: trace.scenario === 'fail-after'
					? Math.min(3, waves)
					: waves,
		},
		history: { terminal: 'complete', yields: waves },
		tools: { terminal: 'complete', yields: waves },
	};
	const channels = {};
	for (const [channel, { terminal, yields }] of Object.entries(expected)) {
		const events = trace.events.filter(
			(event) => event.channel === channel && event.transport === 'document',
		);
		assert.deepEqual(
			events.map((event) => event.type),
			['start', ...Array(yields).fill('yield'), terminal, 'finally'],
			`Incomplete or repeated ${channel} producer lifecycle`,
		);
		assert.deepEqual(
			events.filter((event) => event.type === 'yield').map((event) => event.revision),
			Array.from({ length: yields }, (_, index) => index + 1),
			`Incomplete or reordered ${channel} revisions`,
		);
		assert.ok(
			events.every((event) => typeof event.at === 'number' && Number.isFinite(event.at)),
			`Invalid ${channel} event timestamp`,
		);
		channels[channel] = { terminal, yields };
	}
	for (const name of ['shell', 'history', 'tools']) {
		assert.ok(sample.timings[`${name}HtmlMs`] !== null, `Missing ready ${name} HTML attribute`);
	}
	if (!['empty', 'fail-before'].includes(trace.scenario)) {
		assert.ok(sample.timings.answerHtmlMs !== null, 'Missing ready answer HTML attribute');
	}
	return { scenario: trace.scenario, waves, channels };
}

const readyAttributes = new Map([
	['data-lab-shell', 'shell'],
	['data-answer', 'answer'],
	['data-history', 'history'],
	['data-tools', 'tools'],
]);
const htmlSpace = /[\t\n\f\r ]/;
const rawTextTags = new Set([
	'script',
	'style',
	'textarea',
	'title',
	'xmp',
	'iframe',
	'noembed',
	'noframes',
	'plaintext',
]);

function tagEnd(text, start) {
	let quote = null;
	for (let index = start; index < text.length; index++) {
		const character = text[index];
		if (quote !== null) {
			if (character === quote) quote = null;
		} else if (character === '"' || character === "'") quote = character;
		else if (character === '>') return index;
	}
	return -1;
}

function tagAttributes(tag, start) {
	const attributes = new Map();
	let index = start;
	while (index < tag.length - 1) {
		while (htmlSpace.test(tag[index] ?? '') || tag[index] === '/') index++;
		const nameStart = index;
		while (index < tag.length && !/[\t\n\f\r />=]/.test(tag[index])) index++;
		if (nameStart === index) {
			index++;
			continue;
		}
		const name = tag.slice(nameStart, index).toLowerCase();
		while (htmlSpace.test(tag[index] ?? '')) index++;
		let value = '';
		if (tag[index] === '=') {
			index++;
			while (htmlSpace.test(tag[index] ?? '')) index++;
			const quote = tag[index] === '"' || tag[index] === "'" ? tag[index++] : null;
			const valueStart = index;
			while (
				index < tag.length &&
				(quote === null ? !/[\t\n\f\r >]/.test(tag[index]) : tag[index] !== quote)
			)
				index++;
			value = tag.slice(valueStart, index);
			if (quote !== null) index++;
		}
		if (!attributes.has(name)) attributes.set(name, value);
	}
	return attributes;
}

// Incremental fixture HTML tokenization, rather than a word search. Attribute
// names inside text, comments, quoted values or raw-text elements are ignored.
// Octane carries resolved HTML in JSON string data scripts. Decode those generic
// MIME-typed carriers only once complete; do not inspect result protocol frames.
function readyHtmlScanner(onReady, allowJsonHtml = true, source = 'document-tag') {
	let pending = '';
	let raw = null;
	return {
		push(text) {
			pending += text;
			while (pending.length > 0) {
				if (raw !== null) {
					if (raw.name === 'plaintext') {
						pending = '';
						return;
					}
					const close = raw.close.exec(pending);
					if (close === null) {
						const keep = Math.min(pending.length, raw.name.length + 4);
						if (raw.json) raw.content += pending.slice(0, pending.length - keep);
						pending = pending.slice(pending.length - keep);
						return;
					}
					const end = tagEnd(pending, close.index + 2);
					if (raw.json) raw.content += pending.slice(0, close.index);
					if (end === -1) {
						pending = pending.slice(close.index);
						return;
					}
					if (raw.json) {
						let html;
						try {
							html = JSON.parse(raw.content);
						} catch {
							/* Other JSON data is irrelevant. */
						}
						if (typeof html === 'string') {
							readyHtmlScanner(onReady, false, 'json-html-carrier').push(html);
						}
					}
					raw = null;
					pending = pending.slice(end + 1);
					continue;
				}
				const start = pending.indexOf('<');
				if (start === -1) {
					pending = '';
					return;
				}
				pending = pending.slice(start);
				if ('<!--'.startsWith(pending) && pending.length < 4) return;
				if (pending.startsWith('<!--')) {
					const end = pending.indexOf('-->', 4);
					if (end === -1) return;
					pending = pending.slice(end + 3);
					continue;
				}
				if ('<![CDATA['.startsWith(pending) && pending.length < 9) return;
				if (pending.startsWith('<![CDATA[')) {
					const end = pending.indexOf(']]>', 9);
					if (end === -1) return;
					pending = pending.slice(end + 3);
					continue;
				}
				if (pending.length === 1) return;
				if (!/[a-z/!?]/i.test(pending[1])) {
					pending = pending.slice(1);
					continue;
				}
				const end = tagEnd(pending, 1);
				if (end === -1) return;
				const tag = pending.slice(0, end + 1);
				pending = pending.slice(end + 1);
				const opening = /^<([a-z][a-z0-9:-]*)(?=[\t\n\f\r />])/i.exec(tag);
				if (opening === null) continue;
				const attributes = tagAttributes(tag, opening[0].length);
				for (const name of attributes.keys()) {
					const region = readyAttributes.get(name);
					if (region !== undefined) onReady(region, source);
				}
				const name = opening[1].toLowerCase();
				if (rawTextTags.has(name)) {
					raw = {
						name,
						close: new RegExp(`</${name}(?=[\\t\\n\\f\\r />])`, 'i'),
						json:
							allowJsonHtml &&
							name === 'script' &&
							attributes.get('type')?.toLowerCase() === 'application/json',
						content: '',
					};
				}
			}
		},
	};
}

async function captureOne(options, name) {
	const requestUrl = new URL(options.url);
	const run = `capture-${randomUUID()}`;
	requestUrl.searchParams.set('run', run);
	const sample = {
		name,
		run,
		url: requestUrl.href,
		startedAt: new Date().toISOString(),
		status: null,
		responseHeaders: {},
		htmlCheckpointSources: {},
		timings: {
			headersMs: null,
			firstChunkMs: null,
			shellHtmlMs: null,
			answerHtmlMs: null,
			historyHtmlMs: null,
			toolsHtmlMs: null,
			completeMs: null,
		},
		chunks: [],
		files: { response: `${name}.html`, trace: `${name}.trace.json` },
		ok: false,
	};
	const buffers = [];
	const decoder = new TextDecoder();
	const timer = deadline(options.timeoutMs);
	const start = performance.now();
	let reader;
	let chunkAtMs = null;
	const scanner = readyHtmlScanner((region, source) => {
		if (sample.timings[`${region}HtmlMs`] === null) {
			sample.timings[`${region}HtmlMs`] = chunkAtMs;
			sample.htmlCheckpointSources[region] = source;
		}
	});
	try {
		const response = await fetch(requestUrl, {
			signal: timer.controller.signal,
			redirect: 'error',
			cache: 'no-store',
			headers: { accept: 'text/html', 'accept-encoding': 'identity' },
		});
		sample.timings.headersMs = performance.now() - start;
		sample.status = response.status;
		for (const header of [
			'content-type',
			'content-encoding',
			'content-length',
			'cache-control',
			'transfer-encoding',
		]) {
			const value = response.headers.get(header);
			if (value !== null) sample.responseHeaders[header] = value;
		}
		assert.equal(response.status, 200, `Document returned HTTP ${response.status}`);
		assert.ok(response.body, 'Document has no response body');
		reader = response.body.getReader();
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			if (next.value.byteLength === 0) continue;
			const atMs = performance.now() - start;
			sample.timings.firstChunkMs ??= atMs;
			sample.chunks.push({ atMs, bytes: next.value.byteLength });
			buffers.push(Buffer.from(next.value));
			chunkAtMs = atMs;
			scanner.push(decoder.decode(next.value, { stream: true }));
		}
		sample.timings.completeMs = performance.now() - start;
		assert.ok(sample.timings.firstChunkMs !== null, 'Document response was empty');
	} catch (error) {
		sample.error = String(error.message ?? error);
		timer.controller.abort();
	} finally {
		timer.stop();
		reader?.releaseLock();
	}
	// Concatenation, compression, trace collection and validation are outside the
	// document timings. Fetch-consumer bookkeeping and marker scanning are included.
	const raw = Buffer.concat(buffers);
	sample.bytes = {
		rawResponse: raw.byteLength,
		wholeResponseGzip9: gzipSync(raw, { level: 9 }).byteLength,
		wholeResponseBrotli11: brotliCompressSync(raw, {
			params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
		}).byteLength,
	};
	sample.responseSha256 = sha256(raw);
	await writeFile(path.join(options.output, sample.files.response), raw, { flag: 'wx' });
	try {
		const trace = await fetchTrace(options.url, run, options.timeoutMs);
		await writeJson(options.output, sample.files.trace, trace);
		if (!sample.error) {
			sample.validation = validateTrace(trace, sample);
			sample.ok = true;
		}
	} catch (error) {
		sample.traceError = String(error.message ?? error);
	}
	await writeJson(options.output, `${name}.json`, sample);
	return sample;
}

function statistics(values) {
	const sorted = values.filter((value) => value !== null).sort((a, b) => a - b);
	if (!sorted.length) return { count: 0, median: null, min: null, max: null };
	const middle = Math.floor(sorted.length / 2);
	return {
		count: sorted.length,
		median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
		min: sorted[0],
		max: sorted.at(-1),
	};
}

async function main() {
	if (process.argv.includes('--help')) {
		console.log(usage);
		return;
	}
	const options = parseOptions(process.argv.slice(2));
	// mkdir without recursion and exclusive writes make existing results immutable.
	await mkdir(options.output);
	const before = await sourceSnapshot();
	await writeJson(options.output, 'provenance.json', {
		capturedAt: new Date().toISOString(),
		options,
		environment: {
			node: process.version,
			versions: process.versions,
			platform: process.platform,
			arch: process.arch,
			osRelease: os.release(),
			cpuModel: os.cpus()[0]?.model ?? null,
			logicalCpus: os.cpus().length,
		},
		repositoryRoot,
		scriptSha256: sha256(await readFile(scriptPath)),
		source: before,
	});
	const warmups = [];
	const samples = [];
	let failure = null;
	let after = null;
	try {
		for (const [phase, count, results] of [
			['warmup', options.warmup, warmups],
			['sample', options.runs, samples],
		]) {
			for (let index = 0; index < count; index++) {
				const name = `${phase}-${String(index + 1).padStart(3, '0')}`;
				const sample = await captureOne(options, name);
				results.push(sample);
				assert.ok(
					sample.ok,
					`${name}: ${sample.error ?? sample.traceError ?? 'validation failed'}`,
				);
				console.log(
					`${name}: first chunk ${sample.timings.firstChunkMs.toFixed(2)} ms; complete ${sample.timings.completeMs.toFixed(2)} ms; ${sample.bytes.rawResponse} raw bytes`,
				);
			}
		}
		after = await sourceSnapshot();
		assert.equal(after.gitHead, before.gitHead, 'Git HEAD changed during capture');
		assert.equal(
			after.manifestSha256,
			before.manifestSha256,
			'Source files changed during capture; repeat after they are stable',
		);
	} catch (error) {
		failure = String(error.message ?? error);
		process.exitCode = 1;
	}
	const completeSamples = samples.filter((sample) => sample.ok);
	const summary = {
		ok: failure === null && completeSamples.length === options.runs,
		failure,
		url: options.url,
		requestedRuns: options.runs,
		completedRuns: completeSamples.length,
		warmups: warmups.length,
		timingsMs: Object.fromEntries(
			Object.keys(samples[0]?.timings ?? warmups[0]?.timings ?? {}).map((name) => [
				name,
				statistics(completeSamples.map((sample) => sample.timings[name])),
			]),
		),
		bytes: Object.fromEntries(
			['rawResponse', 'wholeResponseGzip9', 'wholeResponseBrotli11'].map((name) => [
				name,
				statistics(completeSamples.map((sample) => sample.bytes[name])),
			]),
		),
		chunks: statistics(completeSamples.map((sample) => sample.chunks.length)),
		sourceAfter: after && {
			gitHead: after.gitHead,
			manifestSha256: after.manifestSha256,
			changedFiles: after.changedFiles,
		},
		limitations: [
			'HTTP timings start immediately before Node fetch. First chunk is the first consumed nonempty body chunk, not headers or browser paint.',
			'HTML checkpoints require a public ready attribute on a complete HTML start tag. JSON string HTML data carriers are decoded only when the carrier closes; ordinary scripts, comments, text and quoted values are ignored. These checkpoints do not prove display or hydration.',
			'Query signals can deliver later values without replacement HTML. Trace terminals describe producer completion, not client adoption or final UI correctness.',
			'Trace validation checks one complete fixture producer lifecycle and the expected ordered revisions. It does not decode or verify the streamed result protocol or yielded payloads; browser tests cover live values.',
			'Raw bytes are the fetch-exposed response body. Identity encoding is requested, but transport headers, framing and any fetch decompression are excluded.',
			'Gzip level 9 and Brotli quality 11 compress each complete response offline. These sizes are not network transfer or streaming compression measurements.',
			'Samples include authored data delays and local HTTP/consumer overhead. Run serially without competing builds/tests; small samples do not establish tail latency.',
			'Provenance identifies this checkout, not the source loaded by a running server. Build and start the recorded checkout before capture.',
			'Eager/deferred comparisons require identical settings and complete payload correctness; variation alone does not establish a speedup.',
		],
	};
	await writeJson(options.output, 'samples.json', { warmups, samples });
	await writeJson(options.output, 'summary.json', summary);
	console.log(json({ output: options.output, ok: summary.ok, failure }).trimEnd());
}

main().catch((error) => {
	console.error(String(error.message ?? error));
	process.exitCode = 1;
});
