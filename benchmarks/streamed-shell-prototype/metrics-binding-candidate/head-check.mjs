import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { digest, toolchain, tree } from '../signal-chat-route/evidence.mjs';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../..');
assert.ok(process.argv[2], 'Pass the output directory from build.mjs');
const output = path.resolve(process.argv[2]);
const buildBytes = fs.readFileSync(path.join(output, 'build-report.json'));
const report = JSON.parse(buildBytes);
const scriptHash = digest(fs.readFileSync(import.meta.filename));
assert.deepEqual(tree(path.join(repo, 'examples/signal-chat')), report.source);
assert.deepEqual(tree(path.join(output, 'project')), report.projectSource);
assert.deepEqual(toolchain(repo), report.toolchain);
assert.deepEqual(tree(path.join(output, 'project/dist'), new Set()), report.artifactFiles);
for (const [name, hash] of Object.entries(report.sharedInputs))
	assert.equal(digest(fs.readFileSync(path.join(here, '../metrics-shared-view', name))), hash);
for (const [name, hash] of Object.entries(report.candidateInputs))
	assert.equal(digest(fs.readFileSync(path.join(here, name))), hash);

const clientManifest = JSON.parse(report.clientManifest);
const page = clientManifest['src/App.tsrx'].file;
const expectedModules = report.widgets.map((widget) => widget.moduleId).sort();
const serverDriver = path.join(
	repo,
	'benchmarks/streamed-shell-prototype/signal-chat-route/server.mjs',
);
const serverDriverHash = digest(fs.readFileSync(serverDriver));
const child = fork(serverDriver, [path.join(output, 'project')], {
	stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
	execArgv: [],
});
let diagnostics = '';
child.stdout.on('data', (chunk) => (diagnostics += String(chunk)));
child.stderr.on('data', (chunk) => (diagnostics += String(chunk)));
try {
	const [message] = await Promise.race([
		once(child, 'message'),
		once(child, 'exit').then(([code]) => {
			throw new Error(`Server exited ${code}: ${diagnostics}`);
		}),
	]);
	assert.ok(message.port, 'Expected a local server port');
	const samples = [];
	for (const [mode, route, expectedPreloads] of [
		['binding', '/?__bindingMetrics=1', 0],
		['ordinary-metrics', '/', 0],
		['ordinary-root', '/?__ordinaryRoot=1', 1],
		['eager', '/eager', 1],
	]) {
		const url = new URL(route, `http://127.0.0.1:${message.port}`);
		for (const [key, value] of Object.entries({
			auth: '10',
			answer: '10',
			history: '20',
			interval: '5',
			waves: '2',
			turns: '2',
			historyRows: '5',
		}))
			url.searchParams.set(key, value);
		const response = await fetch(url, {
			headers: { 'accept-encoding': 'identity' },
			signal: AbortSignal.timeout(15000),
		});
		assert.equal(response.status, 200, mode);
		assert.equal(response.headers.get('content-encoding'), null, mode);
		const body = Buffer.from(await response.arrayBuffer());
		const html = body.toString('utf8');
		assert.equal(Buffer.from(html).compare(body), 0, 'Expected UTF-8 response');
		const head = html.split('</head>')[0];
		assert.notEqual(head, html, 'Expected a complete document head');
		const preload = `<link rel="modulepreload" href="/${page}">`;
		const pagePreloads = head.split(preload).length - 1;
		assert.equal(pagePreloads, expectedPreloads, mode);
		const styles = [...head.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map((match) => match[0]);
		assert.equal(styles.length, 1, mode);
		const sidecars = [
			...html.matchAll(/<script\b[^>]*\bdata-octane-independent\b[^>]*>([\s\S]*?)<\/script>/g),
		].map((match) => JSON.parse(match[1]));
		assert.equal(sidecars.length, 5, mode);
		assert.deepEqual(
			sidecars.map((sidecar) => sidecar.moduleId).sort(),
			expectedModules,
			`${mode}: expected the five emitted independent modules`,
		);
		assert.ok(
			typeof sidecars[0].buildId === 'string' &&
				sidecars[0].buildId.length > 0 &&
				sidecars.every((sidecar) => sidecar.buildId === sidecars[0].buildId),
			mode,
		);
		samples.push({ mode, path: url.pathname + url.search, body, pagePreloads, styles, sidecars });
	}
	assert.ok(
		samples.every((sample) => JSON.stringify(sample.styles) === JSON.stringify(samples[0].styles)),
	);
	assert.ok(
		samples.every((sample) => sample.sidecars[0].buildId === samples[0].sidecars[0].buildId),
		'Expected the same build identity in every response',
	);
	assert.deepEqual(
		samples[0].styles,
		clientManifest['src/App.tsrx'].css.map((file) => `<link rel="stylesheet" href="/${file}">`),
		'Expected the emitted page stylesheet',
	);
	assert.equal(diagnostics, '', 'Unexpected server diagnostics');
	assert.equal(
		digest(fs.readFileSync(import.meta.filename)),
		scriptHash,
		'Checker changed during execution',
	);
	assert.equal(
		digest(fs.readFileSync(serverDriver)),
		serverDriverHash,
		'Server driver changed during execution',
	);
	assert.deepEqual(tree(path.join(output, 'project/dist'), new Set()), report.artifactFiles);
	const evidence = fs.mkdtempSync(path.join(output, 'ssr-head-check-'));
	const records = samples.map(({ body, sidecars, ...sample }) => {
		const file = `${sample.mode}.html`;
		fs.writeFileSync(path.join(evidence, file), body, { flag: 'wx' });
		return {
			...sample,
			body: { file, bytes: body.length, sha256: digest(body) },
			independentSidecars: sidecars.length,
			moduleIds: sidecars.map((sidecar) => sidecar.moduleId).sort(),
			buildId: sidecars[0].buildId,
		};
	});
	const result = {
		buildReportSha256: digest(buildBytes),
		patchedServerSha256: report.patchedServerSha256,
		checkerSha256: scriptHash,
		serverDriverSha256: serverDriverHash,
		node: process.version,
		page,
		samples: records,
	};
	const file = path.join(evidence, 'report.json');
	fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
	console.log(JSON.stringify({ evidence, report: file, samples: records }, null, 2));
} finally {
	if (child.exitCode === null && child.signalCode === null) {
		const exited = once(child, 'exit');
		child.kill();
		await exited;
	}
}
