// Production SSR wire-payload audit. Keep every comparison behind the existing
// semantic gates: identical news markup, identical component-heavy page markup
// after hydration bookkeeping, and the shared streamed-page correctness proof.

process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build } from 'vite';
import { OCTANE_JSON_CARRIER_RE, verifyStream } from '../lib/stream-verify.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, 'dist', 'payload');
const NO_BUILD = process.argv.includes('--no-build');
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const PROTOCOL_COMMENT_RE = /^<!--[\[\]](?:f[01]|[1-9]\d*)?-->$/;
const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script>/g;

function compressedSizes(html) {
	const bytes = Buffer.from(html);
	return {
		rawBytes: bytes.length,
		gzipBytes: gzipSync(bytes, { level: constants.Z_BEST_COMPRESSION }).length,
		brotliBytes: brotliCompressSync(bytes, {
			params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
		}).length,
		brotli5Bytes: brotliCompressSync(bytes, {
			params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
		}).length,
	};
}

function stripComments(html) {
	return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<!--[\s\S]*?-->/g, (token) =>
		token.startsWith('<!--') ? '' : token,
	);
}

function summarizePayload(html) {
	const scripts = [...html.matchAll(SCRIPT_RE)].map(([script]) => script);
	// A JSON data script can contain literal `<!--[-->` text after parser-safe
	// encoding. Those bytes describe future segment markup, not comments in the
	// streamed shell, so account for the decoded ranges separately below.
	const htmlOutsideScripts = html.replace(SCRIPT_RE, '');
	const comments = [...htmlOutsideScripts.matchAll(COMMENT_RE)].map(([comment]) => comment);
	const commentKinds = Object.create(null);
	for (const comment of comments) commentKinds[comment] = (commentKinds[comment] || 0) + 1;

	let jsonCarrierCount = 0;
	let jsonCarrierBytes = 0;
	let jsonMarkupBytes = 0;
	let jsonEncodingExpansionBytes = 0;
	let jsonMarkupCommentCount = 0;
	let jsonMarkupCommentBytes = 0;
	for (const [carrier, payload] of html.matchAll(OCTANE_JSON_CARRIER_RE)) {
		const decoded = JSON.parse(payload);
		assert.equal(typeof decoded, 'string', 'stream carrier must contain complete HTML markup');
		jsonCarrierCount++;
		jsonCarrierBytes += Buffer.byteLength(carrier);
		jsonMarkupBytes += Buffer.byteLength(decoded);
		jsonEncodingExpansionBytes += Buffer.byteLength(payload) - Buffer.byteLength(decoded);
		for (const [comment] of decoded.matchAll(COMMENT_RE)) {
			jsonMarkupCommentCount++;
			jsonMarkupCommentBytes += Buffer.byteLength(comment);
		}
	}

	const commentBytes = comments.reduce((sum, comment) => sum + Buffer.byteLength(comment), 0);
	const protocolCommentCount = comments.filter((comment) =>
		PROTOCOL_COMMENT_RE.test(comment),
	).length;
	return {
		...compressedSizes(html),
		commentCount: comments.length,
		commentBytes,
		protocolCommentCount,
		commentKinds,
		scriptCount: scripts.length,
		scriptBytes: scripts.reduce((sum, script) => sum + Buffer.byteLength(script), 0),
		jsonCarrierCount,
		jsonCarrierBytes,
		jsonMarkupBytes,
		jsonEncodingExpansionBytes,
		jsonMarkupCommentCount,
		jsonMarkupCommentBytes,
		withoutComments: compressedSizes(stripComments(html)),
	};
}

async function loadProductionEntry(root, name) {
	const outDir = path.join(DIST, name);
	const entry = path.join(outDir, 'entry-server.js');
	if (!NO_BUILD) {
		console.error(`building ${name} (production SSR)…`);
		await build({
			root,
			logLevel: 'warn',
			build: { ssr: 'src/entry-server.ts', outDir, emptyOutDir: true },
			ssr: { noExternal: ['@tsrx/react'] },
		});
	}
	assert.ok(fs.existsSync(entry), `missing ${entry}; run without --no-build first`);
	return import(pathToFileURL(entry).href);
}

const results = {
	suite: 'ssr-payload',
	news: Object.create(null),
	componentHeavy: Object.create(null),
	controlFlow: Object.create(null),
	streaming: Object.create(null),
};

const newsBodies = Object.create(null);
for (const target of ['octane-tsrx', 'octane-jsx', 'react']) {
	const module = await loadProductionEntry(path.join(HERE, '..', 'news', target), `news-${target}`);
	const { body } = await module.renderApp();
	const cards = (body.match(/<article[\s>]/g) || []).length;
	assert.equal(cards, 50, `${target}: news dataset must contain the same 50 cards`);
	newsBodies[target] = body;
	results.news[target] = { ...summarizePayload(body), cards };
}

for (const target of ['octane-tsrx', 'octane-jsx']) {
	assert.equal(
		stripComments(newsBodies[target]),
		stripComments(newsBodies.react),
		`${target}: news page changed its React-visible markup`,
	);
}

const fixtures = await loadProductionEntry(path.join(HERE, 'fixtures'), 'fixtures');
const compiled = (await fixtures.renderDeoptFast()).body;
const descriptor = (await fixtures.renderDeoptPlain()).body;
const visibleMarkup = stripComments(compiled);
assert.equal(
	visibleMarkup,
	stripComments(descriptor),
	'compiled and descriptor-heavy pages must render byte-identical visible markup',
);
assert.equal((compiled.match(/<article[\s>]/g) || []).length, 300);
results.componentHeavy['compiled-tsrx'] = summarizePayload(compiled);
results.componentHeavy['descriptor-bindings'] = summarizePayload(descriptor);
results.componentHeavy['visible-markup'] = summarizePayload(visibleMarkup);

const controlFlow = (await fixtures.renderControlFlow()).body;
const controlFlowStatic = fixtures.renderControlFlowStatic().body;
assert.equal(
	stripComments(controlFlow),
	controlFlowStatic,
	'hydratable control-flow branches must match their non-hydratable visible markup',
);
assert.equal((controlFlow.match(/class="control-row"/g) || []).length, 300);
assert.equal((controlFlow.match(/class="(?:featured|ordinary)"/g) || []).length, 300);
assert.equal((controlFlow.match(/class="tier"/g) || []).length, 300);
results.controlFlow['hydratable-branches'] = summarizePayload(controlFlow);
results.controlFlow['static-visible-markup'] = summarizePayload(controlFlowStatic);

for (const [target, directory] of [
	['octane-tsrx', 'octane'],
	['react', 'react'],
]) {
	const module = await loadProductionEntry(
		path.join(HERE, '..', 'streaming-ssr', directory),
		`stream-${target}`,
	);
	const chunks = [];
	const started = performance.now();
	await module.renderStream('all-fast', (chunk) => chunks.push(String(chunk)));
	const html = chunks.join('');
	verifyStream(
		target,
		'all-fast',
		{ html, firstChunk: chunks[0], total: performance.now() - started },
		10,
	);
	results.streaming[target] = { ...summarizePayload(html), chunks: chunks.length };
}

function printGroup(title, targets) {
	console.log(`\n${title}`);
	console.log('target                 raw      gzip    brotli  comments  comment B   carriers');
	for (const [target, metric] of Object.entries(targets)) {
		console.log(
			`${target.padEnd(21)} ${String(metric.rawBytes).padStart(6)} ` +
				`${String(metric.gzipBytes).padStart(8)} ${String(metric.brotliBytes).padStart(9)} ` +
				`${String(metric.commentCount).padStart(9)} ${String(metric.commentBytes).padStart(10)} ` +
				`${String(metric.jsonCarrierBytes).padStart(10)}`,
		);
	}
}

printGroup('50-card news page (same visible HTML)', results.news);
printGroup('300-card component-heavy page (same visible HTML)', results.componentHeavy);
printGroup('300-row @if / @switch page (same visible HTML)', results.controlFlow);
printGroup('10-boundary Suspense stream (same visible cards)', results.streaming);

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(results, null, '\t') + '\n');
	console.error(`\nBENCH_JSON written → ${process.env.BENCH_JSON}`);
}
