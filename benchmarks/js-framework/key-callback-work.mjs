// Production work gate for the two selected per-list key callback sites.
// Precise coverage observes closure-expression execution in readable output;
// timings and bundle sizes use a separate, clean minified production build.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import ts from 'typescript';
import { build } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, 'octane-tsrx');
const label = process.env.WORK_BUILD_LABEL ?? 'candidate';
assert.match(label, /^[a-zA-Z0-9-]+$/);
const output = path.join(fixture, 'dist', `key-callback-${label}`);
const samples = Math.max(0, Number(process.argv[2] ?? 30));
const compiledUpdateOnly = process.argv.includes('--compiled-update-only');
const compiledUpdateBatch = Number(process.env.WORK_COMPILED_UPDATE_BATCH ?? 256);
assert.ok(
	Number.isInteger(compiledUpdateBatch) && compiledUpdateBatch > 0 && compiledUpdateBatch % 2 === 0,
	'compiled update batch must be a positive even integer',
);
const kinds = ['many', 'mapped', 'compiled'];
const groups = 512;
const rows = groups * 4;
const hash = (value) => createHash('sha256').update(value).digest('hex');

if (!process.argv.includes('--no-build')) {
	for (const mode of ['observed', 'timing']) {
		await build({
			root: fixture,
			configFile: path.join(fixture, 'vite.config.key-callback.js'),
			logLevel: 'warn',
			build: {
				outDir: path.join(output, mode),
				emptyOutDir: true,
				minify: mode === 'timing' ? 'esbuild' : false,
			},
		});
	}
}

function assets(mode) {
	const directory = path.join(output, mode, 'assets');
	return fs
		.readdirSync(directory)
		.filter((name) => name.endsWith('.js'))
		.map((name) => ({
			name,
			source: fs.readFileSync(path.join(directory, name), 'utf8'),
		}));
}

const minified = assets('timing');
const bundle = {
	bytes: minified.reduce((total, asset) => total + Buffer.byteLength(asset.source), 0),
	gzipBytes: minified.reduce((total, asset) => total + gzipSync(asset.source).length, 0),
	sha: hash(minified.map(({ name, source }) => `${name}\n${source}`).join('\n')),
};

function findKeySites() {
	const matches = [];
	for (const asset of assets('observed')) {
		const ast = ts.createSourceFile(asset.name, asset.source, ts.ScriptTarget.Latest, true);
		function visit(node) {
			if (ts.isFunctionDeclaration(node) && node.name?.text === 'renderPreparedChildList') {
				const sites = [];
				function closure(child) {
					if (
						(ts.isArrowFunction(child) ||
							ts.isFunctionExpression(child) ||
							ts.isFunctionDeclaration(child)) &&
						child.parameters.length === 2 &&
						child.parameters.every((parameter) => ts.isIdentifier(parameter.name))
					) {
						let body = child.body;
						if (
							body &&
							ts.isBlock(body) &&
							body.statements.length === 1 &&
							ts.isReturnStatement(body.statements[0])
						)
							body = body.statements[0].expression;
						while (body && ts.isParenthesizedExpression(body)) body = body.expression;
						const names = child.parameters.map((parameter) => parameter.name.text);
						const parameter = (value, index) =>
							value && ts.isIdentifier(value) && value.text === names[index];
						const descriptor =
							body && ts.isElementAccessExpression(body) && parameter(body.argumentExpression, 1);
						const mapped =
							body &&
							ts.isBinaryExpression(body) &&
							body.operatorToken.kind === ts.SyntaxKind.PlusToken &&
							ts.isStringLiteral(body.left) &&
							body.left.text === 'k' &&
							ts.isCallExpression(body.right) &&
							ts.isIdentifier(body.right.expression) &&
							body.right.expression.text === 'String' &&
							body.right.arguments.length === 1 &&
							ts.isCallExpression(body.right.arguments[0]) &&
							body.right.arguments[0].arguments.length === 2 &&
							body.right.arguments[0].arguments.every((argument, index) =>
								parameter(argument, index),
							);
						if (descriptor || mapped)
							sites.push({
								kind: descriptor ? 'descriptor' : 'mapped',
								start: child.getStart(ast),
								end: child.end,
							});
					}
					ts.forEachChild(child, closure);
				}
				closure(node.body);
				matches.push({ name: asset.name, sourceSha: hash(asset.source), sites });
			}
			ts.forEachChild(node, visit);
		}
		visit(ast);
	}
	assert.equal(matches.length, 1, 'one readable production list renderer');
	assert.ok(
		matches[0].sites.length === 0 || matches[0].sites.length === 2,
		'review changed callback source shape',
	);
	return matches[0];
}

const source = findKeySites();
if (process.argv.includes('--build-only')) {
	console.log(JSON.stringify({ label, bundle, source }, null, 2));
} else {
	const server = createServer((request, response) => {
		const url = new URL(request.url, 'http://127.0.0.1');
		const parts = url.pathname.split('/').filter(Boolean);
		const mode = parts.shift();
		if ((mode !== 'observed' && mode !== 'timing') || parts.some((part) => part === '..')) {
			response.writeHead(404).end();
			return;
		}
		const file = path.join(output, mode, ...parts);
		if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
			response.writeHead(404).end();
			return;
		}
		response.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
		response.end(fs.readFileSync(file));
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const origin = `http://127.0.0.1:${server.address().port}`;
	const invoke = (page, operation) =>
		page.evaluate((name) => window.__keyCallbackWork(name), operation);
	async function verify(page, kind, phase) {
		return page.evaluate(
			({ kind, phase, count }) => {
				const main = document.querySelector(`[data-kind="${kind}"]`);
				if (!main) throw new Error('missing work root');
				const elements = Array.from(main.querySelectorAll('li'));
				if (elements.length !== count) throw new Error(`wrong row count ${elements.length}`);
				const reordered = phase === 'reorder';
				const expected = Array.from({ length: count }, (_, index) => {
					if (!reordered) return index;
					return kind === 'compiled'
						? count - index - 1
						: Math.floor(index / 4) * 4 + [0, 3, 1, 2][index % 4];
				});
				const version = phase === 'mount' ? '0' : '1';
				if (main.getAttribute('data-version') !== version) throw new Error('update did not commit');
				let before = window.__keyCallbackBefore;
				if (phase === 'mount') before = window.__keyCallbackBefore = new Map();
				for (let index = 0; index < count; index++) {
					const id = expected[index];
					const row = elements[index];
					const input = row.querySelector('input');
					if (
						row.getAttribute('data-row') !== String(id) ||
						!input ||
						input.getAttribute('aria-label') !== `row ${id}`
					) {
						throw new Error(`incorrect row content/order at ${index}`);
					}
					if (phase === 'mount') {
						if (input.value !== `row ${id}`) throw new Error('wrong initial input value');
						before.set(id, { row, input });
						if (id % 257 === 0) input.value = `typed ${id}`;
					} else {
						const previous = before.get(id);
						if (row !== previous.row || input !== previous.input)
							throw new Error(`row ${id} lost identity`);
						if (input.value !== (id % 257 === 0 ? `typed ${id}` : `row ${id}`))
							throw new Error(`row ${id} lost input state`);
					}
				}
				if (phase === 'mount') before.get(0).input.focus();
				else if (document.activeElement !== before.get(0).input)
					throw new Error('focused input was replaced');
				return { rows: elements.length, html: main.innerHTML };
			},
			{ kind, phase, count: rows },
		);
	}
	function creationWork(coverage) {
		const script = coverage.result.find((entry) => entry.url.endsWith(`/assets/${source.name}`));
		assert.ok(script, 'observed production asset coverage');
		const render = script.functions.find((fn) => fn.functionName === 'renderPreparedChildList');
		const work = { listCalls: render?.ranges[0]?.count ?? 0, descriptor: 0, mapped: 0 };
		for (const site of source.sites) {
			const ranges =
				render?.ranges.filter(
					(range) => range.startOffset <= site.start && range.endOffset >= site.end,
				) ?? [];
			ranges.sort((a, b) => a.endOffset - a.startOffset - (b.endOffset - b.startOffset));
			work[site.kind] += ranges[0]?.count ?? 0;
		}
		return work;
	}
	async function runCase(browser, mode, kind) {
		const context = await browser.newContext();
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		let cdp;
		try {
			await page.goto(`${origin}/${mode}/key-callback-work.html`);
			await page.waitForFunction(() => window.__ready === true);
			if (mode === 'observed') {
				cdp = await context.newCDPSession(page);
				await cdp.send('Profiler.enable');
				await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
			}
			const phases = {};
			for (const phase of ['mount', 'update', 'reorder', 'restore']) {
				if (cdp) await cdp.send('Profiler.takePreciseCoverage');
				await invoke(page, `${phase}-${kind}`);
				const work = cdp ? creationWork(await cdp.send('Profiler.takePreciseCoverage')) : undefined;
				const visible = await verify(page, kind, phase);
				phases[phase] = {
					rows: visible.rows,
					htmlSha: hash(visible.html),
					...(work ? { work } : {}),
				};
			}
			let timing;
			if (mode === 'timing' && samples > 0 && (!compiledUpdateOnly || kind === 'compiled')) {
				timing = await page.evaluate(
					({ kind, samples, compiledUpdateOnly, compiledUpdateBatch }) => {
						const result = {};
						for (const operation of compiledUpdateOnly ? ['update'] : ['update', 'reorder']) {
							const batch = kind === 'compiled' && operation === 'update' ? compiledUpdateBatch : 8;
							let reordered = false;
							const step = () => {
								const action =
									operation === 'update'
										? 'update'
										: (reordered = !reordered)
											? 'reorder'
											: 'restore';
								window.__keyCallbackWork(`${action}-${kind}`);
							};
							for (let i = 0; i < 16; i++) step();
							const times = [];
							for (let i = 0; i < samples; i++) {
								const start = performance.now();
								for (let j = 0; j < batch; j++) step();
								times.push((performance.now() - start) / batch);
							}
							times.sort((a, b) => a - b);
							result[operation] = {
								samples,
								operationsPerSample: batch,
								medianMs: times[Math.floor(samples / 2)],
								p95Ms: times[Math.floor(samples * 0.95)],
							};
						}
						return result;
					},
					{ kind, samples, compiledUpdateOnly, compiledUpdateBatch },
				);
				await verify(page, kind, 'restore');
				if (!compiledUpdateOnly) {
					timing.mount = await page.evaluate(
						({ kind, samples }) => {
							const mount = () => window.__keyCallbackWork(`mount-${kind}`);
							const unmount = () => window.__keyCallbackWork(`unmount-${kind}`);
							unmount();
							for (let i = 0; i < 4; i++) {
								mount();
								unmount();
							}
							const times = [];
							for (let i = 0; i < samples; i++) {
								const start = performance.now();
								mount();
								times.push(performance.now() - start);
								unmount();
							}
							times.sort((a, b) => a - b);
							mount();
							return {
								samples,
								operationsPerSample: 1,
								medianMs: times[Math.floor(samples / 2)],
								p95Ms: times[Math.floor(samples * 0.95)],
							};
						},
						{ kind, samples },
					);
					await verify(page, kind, 'mount');
				}
			}
			assert.deepEqual(errors, [], `${kind}: browser errors`);
			await invoke(page, `unmount-${kind}`);
			assert.equal(
				await page.locator(`[data-kind="${kind}"]`).count(),
				0,
				'unmount removes work root',
			);
			return { phases, ...(timing ? { timing } : {}) };
		} finally {
			if (cdp) await cdp.send('Profiler.stopPreciseCoverage').catch(() => {});
			await context.close();
		}
	}
	let browser;
	try {
		let observed;
		if (!process.argv.includes('--timing-only')) {
			browser = await chromium.launch({
				headless: true,
				args: ['--no-sandbox', '--js-flags=--jitless'],
			});
			observed = {};
			for (const kind of kinds) observed[kind] = await runCase(browser, 'observed', kind);
			await browser.close();
		}
		browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
		const environment = { node: process.version, chromium: browser.version() };
		const clean = {};
		for (const kind of kinds) clean[kind] = await runCase(browser, 'timing', kind);
		const callbacks = Number(process.env.WORK_EXPECT_CALLBACKS ?? 0);
		for (const kind of observed ? kinds : []) {
			for (const phase of ['mount', 'update', 'reorder', 'restore']) {
				const { work, ...semantic } = observed[kind].phases[phase];
				assert.deepEqual(
					semantic,
					clean[kind].phases[phase],
					`${kind}/${phase}: observed/clean HTML`,
				);
				assert.deepEqual(
					work,
					{
						listCalls: kind === 'compiled' ? 0 : groups,
						descriptor: kind === 'many' ? callbacks : 0,
						mapped: kind === 'mapped' ? callbacks : 0,
					},
					`${kind}/${phase}: executed key callback construction sites`,
				);
			}
		}
		const semanticSha = hash(
			JSON.stringify(Object.fromEntries(kinds.map((kind) => [kind, clean[kind].phases]))),
		);
		if (process.env.WORK_EXPECTED_HTML_SHA)
			assert.equal(
				semanticSha,
				process.env.WORK_EXPECTED_HTML_SHA,
				'baseline/candidate complete HTML',
			);
		const result = {
			suite: 'js-framework-style-work/key-callback',
			label,
			environment,
			bundle,
			source,
			semanticSha,
			observed,
			clean,
		};
		if (process.env.WORK_JSON)
			fs.writeFileSync(process.env.WORK_JSON, JSON.stringify(result, null, 2) + '\n');
		console.log(JSON.stringify(result, null, 2));
	} finally {
		await browser?.close();
		await new Promise((resolve) => server.close(resolve));
	}
}
