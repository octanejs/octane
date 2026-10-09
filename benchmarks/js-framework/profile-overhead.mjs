// Counter cost on the same profile-compiled js-framework program. Component
// timings remain enabled in every lane; timeline output is disabled. The
// source-only controls remove counter work without changing renderer behavior.
// node benchmarks/js-framework/profile-overhead.mjs [samples=9]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build, preview, parseSync } from 'vite';
import { octane } from 'octane/compiler/vite';
import { chromium } from 'playwright';
import { CANONICAL_OPS, ensureState, seedRandom, timeClick } from './operations.mjs';

const root = path.resolve(import.meta.dirname, 'octane-tsrx');
const samples = Number(process.argv[2] ?? 9);
assert.ok(Number.isSafeInteger(samples) && samples > 0);
const modes = ['off', 'global', 'attributed'];
const noAttribution = new Set([
	'__profileRootEnter',
	'__profileRootExit',
	'__profileQueueWork',
	'__profileWorkEnter',
	'__profileQueueCleanup',
]);

function controlSource(source, mode) {
	if (mode === 'attributed') return source;
	const { program, errors } = parseSync('profiling.ts', source, {
		lang: 'ts',
		sourceType: 'module',
	});
	assert.deepEqual(errors, []);
	const edits = [];
	function visit(node) {
		if (!node || typeof node !== 'object') return;
		if (node.type === 'FunctionDeclaration') {
			const name = node.id.name;
			let body;
			if (noAttribution.has(name)) body = '';
			if (name === '__profileRootCommitted')
				body = mode === 'off' ? '' : '__profileCount(COMMIT_ROOT);';
			if (name === '__profileCount')
				body = mode === 'off' ? '' : 'if (active) counts[id] += amount;';
			if (name === '__profileEffect')
				body =
					mode === 'off'
						? ''
						: `
				if (active && phase >= 0) counts[(cleanup ? ProfileCounter.EFFECT_CLEANUP_INSERTION : ProfileCounter.EFFECT_RUN_INSERTION) + phase]++;
			`;
			if (name === '__profileCaptureDiscarded' && mode === 'off') body = '';
			if (body !== undefined) {
				edits.push([node.body.start + 1, node.body.end - 1, body]);
				return;
			}
		}
		// Attribution writes in the existing render/bailout recorder are kept
		// separate from component timing and event recording.
		if (node.type === 'ExpressionStatement') {
			const code = source.slice(node.start, node.end);
			if (
				/^(?:frame\.counters\[|componentTable\(|currentCommit\.counts\[)/.test(code) ||
				(mode === 'off' && /^counts\[/.test(code))
			) {
				edits.push([node.start, node.end, ';']);
				return;
			}
		}
		if (
			node.type === 'Property' &&
			node.key?.name === 'counters' &&
			node.value?.type === 'CallExpression' &&
			node.value.callee.name === 'componentTable'
		) {
			edits.push([node.start, node.end + (source[node.end] === ',' ? 1 : 0), '']);
			return;
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'loc') continue;
			if (Array.isArray(value)) for (const child of value) visit(child);
			else if (value && typeof value === 'object') visit(value);
		}
	}
	visit(program);
	assert.ok(edits.length >= 10, 'counter control no longer matches the recorder');
	for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0]))
		source = source.slice(0, start) + replacement + source.slice(end);
	return source;
}

const servers = [];
const pages = [];
const errors = [];
let browser;
const results = Object.fromEntries(modes.map((mode) => [mode, {}]));
try {
	for (const mode of modes) {
		const outDir = path.resolve(import.meta.dirname, 'dist/profile-overhead', mode);
		await build({
			configFile: false,
			root,
			logLevel: 'warn',
			plugins: [
				{
					name: 'profile-counter-control',
					enforce: 'pre',
					transform(source, id) {
						if (id.endsWith('/octane/src/profiling.ts')) return controlSource(source, mode);
					},
				},
				octane({ profile: true, hmr: false }),
			],
			build: { outDir, emptyOutDir: true, minify: 'esbuild', target: 'esnext' },
		});
		servers.push(
			await preview({
				configFile: false,
				root,
				logLevel: 'error',
				build: { outDir },
				preview: { host: '127.0.0.1', port: 0 },
			}),
		);
	}
	browser = await chromium.launch({ headless: true, args: ['--js-flags=--expose-gc'] });
	for (let i = 0; i < modes.length; i++) {
		const page = await browser.newPage();
		pages.push(page);
		page.on('pageerror', (error) => errors.push(error));
		await page.goto(`http://127.0.0.1:${servers[i].httpServer.address().port}`);
		await page.waitForSelector('#run');
		await page.evaluate(() => globalThis.__OCTANE_PROFILER__.start({ timeline: false }));
		await seedRandom(page);
		assert.deepEqual(errors, []);
	}
	for (const op of CANONICAL_OPS) {
		for (const mode of modes) results[mode][op.name] = [];
		// Rotate lane order each round, retaining the same warmup and inputs.
		for (let round = -3; round < samples; round++) {
			for (let lane = 0; lane < modes.length; lane++) {
				const i = (round + 3 + lane) % modes.length;
				const page = pages[i];
				await ensureState(page, op.pre);
				await page.evaluate(() => globalThis.__OCTANE_PROFILER__.clear());
				const selector = op.alternateClick && round % 2 === 0 ? op.alternateClick : op.click;
				const elapsed = await timeClick(page, op, [selector]);
				if (round >= 0) results[modes[i]][op.name].push(elapsed);
				const counters = await page.evaluate(() => globalThis.__OCTANE_PROFILER__.counters());
				if (modes[i] === 'off') assert.ok(Object.values(counters).every((value) => value === 0));
				else assert.ok(counters['component.render'] > 0);
			}
		}
		const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
		const row = Object.fromEntries(modes.map((mode) => [mode, median(results[mode][op.name])]));
		console.log(
			JSON.stringify({
				operation: op.name,
				milliseconds: row,
				globalRatio: row.global / row.off,
				attributedRatio: row.attributed / row.off,
			}),
		);
	}
	assert.deepEqual(errors, []);
	if (process.env.BENCH_JSON)
		fs.writeFileSync(
			process.env.BENCH_JSON,
			JSON.stringify({ browser: browser.version(), samples, results }, null, 2) + '\n',
		);
} finally {
	await browser?.close();
	for (const server of servers) await new Promise((done) => server.httpServer.close(done));
}
