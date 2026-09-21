import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const captureScript = fileURLToPath(new URL('./capture.mjs', import.meta.url));
const repositoryRoot = path.resolve(path.dirname(captureScript), '../../..');
const prompt = 'Explain data-history data-tools data-answer';
const impostors =
	`<p>${prompt}</p>` +
	'<input value="data-answer= data-tools= > <aside data-history>">' +
	'<!-- <div data-answer data-history data-tools> -->' +
	'<script>const text = "<div data-answer data-history data-tools>";</script>' +
	'<style>.example { content: "<div data-answer data-history data-tools>"; }</style>' +
	'<textarea><div data-answer data-history data-tools></textarea>' +
	'<title><aside data-history></title>' +
	'<div data-answer-pending data-history-pending data-tools-pending></div>' +
	'<script type="application/json">["<div data-answer data-tools data-history>"]</script>';
const readyHtml =
	'<aside data-history="ready"></aside>' +
	'<section DATA-TOOLS="ready"></section>' +
	'<p data-answer="ready">The complete answer.</p>';

function completeTrace(run) {
	const events = [];
	for (const channel of ['session', 'answer', 'history', 'tools']) {
		events.push({ channel, type: 'start', transport: 'document', at: 0 });
		if (channel !== 'session') {
			for (let revision = 1; revision <= 3; revision++) {
				events.push({ channel, type: 'yield', revision, transport: 'document', at: revision });
			}
		}
		events.push(
			{ channel, type: 'complete', transport: 'document', at: 4 },
			{ channel, type: 'finally', transport: 'document', at: 4 },
		);
	}
	return { run, scenario: 'steady', truncated: false, events };
}

async function runCli(args) {
	const child = spawn(process.execPath, [captureScript, ...args], {
		cwd: repositoryRoot,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let stdout = '';
	let stderr = '';
	child.stdout.on('data', (data) => {
		stdout += data;
	});
	child.stderr.on('data', (data) => {
		stderr += data;
	});
	const timer = setTimeout(() => child.kill('SIGTERM'), 45_000);
	timer.unref();
	try {
		const result = await new Promise((resolve, reject) => {
			child.once('error', reject);
			child.once('close', (code, signal) => resolve({ code, signal }));
		});
		return { ...result, stdout, stderr };
	} finally {
		clearTimeout(timer);
	}
}

async function withFixture(parts, mutateTrace, verify) {
	const temporary = await mkdtemp(path.join(os.tmpdir(), 'signal-chat-capture-test-'));
	const output = path.join(temporary, 'capture');
	const traces = new Map();
	const server = createServer((request, response) => {
		const url = new URL(request.url, 'http://localhost');
		const run = url.searchParams.get('run');
		if (url.pathname === '/__lab/trace') {
			const trace = traces.get(run);
			response.writeHead(trace ? 200 : 404, { 'Content-Type': 'application/json' });
			response.end(JSON.stringify(trace ?? { error: 'Unknown fixture run' }));
			return;
		}
		assert.equal(url.searchParams.get('q'), prompt);
		assert.equal(url.searchParams.get('waves'), '3');
		const trace = completeTrace(run);
		mutateTrace?.(trace);
		traces.set(run, trace);
		response.writeHead(200, { 'Content-Type': 'text/html' });
		(async () => {
			for (const part of parts) {
				response.write(part);
				await delay(10);
			}
			response.end();
		})().catch((error) => response.destroy(error));
	});
	try {
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const url = new URL(`http://127.0.0.1:${server.address().port}/`);
		url.searchParams.set('q', prompt);
		url.searchParams.set('waves', '3');
		const result = await runCli([
			`--url=${url.href}`,
			'--runs=1',
			'--warmup=0',
			`--output=${output}`,
		]);
		assert.equal(result.signal, null, result.stdout + result.stderr);
		const sample = JSON.parse(await readFile(path.join(output, 'sample-001.json'), 'utf8'));
		const summary = JSON.parse(await readFile(path.join(output, 'summary.json'), 'utf8'));
		const html = await readFile(path.join(output, 'sample-001.html'), 'utf8');
		await verify({ ...result, sample, summary, html });
	} finally {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
		await rm(temporary, { recursive: true, force: true });
	}
}

function chunkAtByte(sample, byteOffset) {
	let bytes = 0;
	for (const chunk of sample.chunks) {
		bytes += chunk.bytes;
		if (bytes >= byteOffset) return chunk.atMs;
	}
	assert.fail('The expected HTML was not captured');
}

test('prompt words, quoted values and raw text cannot imitate ready HTML', async () => {
	await withFixture(
		['<main data-lab-shell>', impostors, '</main>'],
		null,
		({ code, sample, summary }) => {
			assert.equal(code, 1);
			assert.equal(summary.ok, false);
			assert.match(summary.failure, /Missing ready/);
			for (const region of ['answer', 'history', 'tools']) {
				assert.equal(sample.timings[`${region}HtmlMs`], null);
			}
		},
	);
});

test('ready checkpoints observe complete start tags split across response writes', async () => {
	await withFixture(
		[
			'<main data-lab-shell>' + impostors,
			'<aside data-his',
			readyHtml.slice('<aside data-his'.length),
			'</main>',
		],
		null,
		({ code, sample, summary, html, stdout, stderr }) => {
			assert.equal(code, 0, stdout + stderr);
			assert.equal(summary.completedRuns, 1);
			for (const [region, tag] of [
				['history', '<aside data-history="ready">'],
				['tools', '<section DATA-TOOLS="ready">'],
				['answer', '<p data-answer="ready">'],
			]) {
				const end = html.lastIndexOf(tag) + tag.length;
				assert.ok(end >= tag.length, `Missing ${region} fixture HTML`);
				assert.equal(
					sample.timings[`${region}HtmlMs`],
					chunkAtByte(sample, Buffer.byteLength(html.slice(0, end))),
				);
				assert.equal(sample.htmlCheckpointSources[region], 'document-tag');
			}
		},
	);
});

test('JSON string HTML checkpoints observe the complete split data carrier', async () => {
	const payload = JSON.stringify(readyHtml);
	const middle = Math.floor(payload.length / 2);
	await withFixture(
		[
			'<main data-lab-shell>' + impostors,
			'<script type="application/json">' + payload.slice(0, middle),
			payload.slice(middle) + '</scr',
			'ipt></main>',
		],
		null,
		({ code, sample, summary, html, stdout, stderr }) => {
			assert.equal(code, 0, stdout + stderr);
			assert.equal(summary.ok, true);
			const end = html.lastIndexOf('</script>') + '</script>'.length;
			const completeCarrierAt = chunkAtByte(sample, Buffer.byteLength(html.slice(0, end)));
			for (const region of ['answer', 'history', 'tools']) {
				assert.equal(sample.timings[`${region}HtmlMs`], completeCarrierAt);
				assert.equal(sample.htmlCheckpointSources[region], 'json-html-carrier');
			}
		},
	);
});

test('a complete terminal cannot hide a missing producer wave', async () => {
	await withFixture(
		['<main data-lab-shell>', readyHtml, '</main>'],
		(trace) => {
			trace.events = trace.events.filter(
				(event) => !(event.channel === 'tools' && event.type === 'yield' && event.revision === 2),
			);
		},
		({ code, sample, summary }) => {
			assert.equal(code, 1);
			assert.equal(sample.ok, false);
			assert.equal(summary.completedRuns, 0);
			assert.match(summary.failure, /tools producer lifecycle/);
		},
	);
});

test('all expected waves must carry the ordered revisions', async () => {
	await withFixture(
		['<main data-lab-shell>', readyHtml, '</main>'],
		(trace) => {
			const event = trace.events.find(
				(event) => event.channel === 'answer' && event.type === 'yield' && event.revision === 2,
			);
			event.revision = 3;
		},
		({ code, sample, summary }) => {
			assert.equal(code, 1);
			assert.equal(sample.ok, false);
			assert.equal(summary.completedRuns, 0);
			assert.match(summary.failure, /answer revisions/);
		},
	);
});
