import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from 'playwright';
import { deterministicCount } from '../lib/dom-nodes.mjs';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import { STATIC_A, STATIC_B, createStreamFrames } from './corpus.mjs';

const ITER = Number.parseInt(process.argv[2] || '8', 10);
const TARGETS = [
	{
		name: 'react-streamdown',
		url: 'http://localhost:5300/',
		dist: path.resolve(import.meta.dirname, 'react/dist'),
	},
	{
		name: 'octane-streamdown',
		url: 'http://localhost:5301/',
		dist: path.resolve(import.meta.dirname, 'octane/dist'),
	},
];
const FINE_FRAMES = createStreamFrames(32);
const COARSE_FRAMES = createStreamFrames(256);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const OPS = [
	{
		name: 'mountStatic',
		expectedMarker: 'STATIC_A_COMPLETE',
		prepare: async (page) => page.evaluate(() => window.__reset()),
		run: async (page) =>
			page.evaluate(
				({ content }) => {
					const started = performance.now();
					for (let index = 0; index < 7; index += 1) {
						window.__renderMarkdown(content, 'static');
						window.__unmountMarkdown();
					}
					window.__renderMarkdown(content, 'static');
					return performance.now() - started;
				},
				{ content: STATIC_A },
			),
	},
	{
		name: 'replaceStatic',
		expectedMarker: 'STATIC_A_COMPLETE',
		prepare: async (page) =>
			page.evaluate((content) => window.__renderMarkdown(content, 'static'), STATIC_A),
		run: async (page) =>
			page.evaluate(
				({ first, second }) => {
					const started = performance.now();
					for (let index = 0; index < 8; index += 1) {
						window.__renderMarkdown(index % 2 === 0 ? second : first, 'static');
					}
					return performance.now() - started;
				},
				{ first: STATIC_A, second: STATIC_B },
			),
	},
	{
		name: 'streamFine',
		expectedMarker: 'STREAM_COMPLETE',
		prepare: async (page) => page.evaluate(() => window.__reset()),
		run: async (page) =>
			page.evaluate((frames) => {
				const started = performance.now();
				for (const frame of frames) window.__renderMarkdown(frame, 'streaming');
				return performance.now() - started;
			}, FINE_FRAMES),
	},
	{
		name: 'streamCoarse',
		expectedMarker: 'STREAM_COMPLETE',
		prepare: async (page) => page.evaluate(() => window.__reset()),
		run: async (page) =>
			page.evaluate((frames) => {
				const started = performance.now();
				for (const frame of frames) window.__renderMarkdown(frame, 'streaming');
				return performance.now() - started;
			}, COARSE_FRAMES),
	},
];

function directoryBytes(directory) {
	const totals = {
		jsRaw: 0,
		jsGzip: 0,
		cssRaw: 0,
		cssGzip: 0,
	};
	const pending = [directory];
	while (pending.length > 0) {
		const current = pending.pop();
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const file = path.join(current, entry.name);
			if (entry.isDirectory()) {
				pending.push(file);
				continue;
			}
			const kind = entry.name.endsWith('.js') ? 'js' : entry.name.endsWith('.css') ? 'css' : null;
			if (kind === null) continue;
			const contents = fs.readFileSync(file);
			totals[`${kind}Raw`] += contents.byteLength;
			totals[`${kind}Gzip`] += zlib.gzipSync(contents, { level: 9 }).byteLength;
		}
	}
	return totals;
}

async function semanticSnapshot(page, expectedMarker) {
	return page.evaluate((marker) => {
		const root = document.querySelector('.bench-shell');
		if (root === null || !root.textContent.includes(marker)) {
			throw new Error(`Streamdown document did not commit marker ${marker}`);
		}
		const count = (selector) => root.querySelectorAll(selector).length;
		return {
			text: root.textContent.replace(/\s+/g, ' ').trim(),
			headings: count('h1, h2, h3, h4, h5, h6'),
			paragraphs: count('p'),
			lists: count('ul, ol'),
			listItems: count('li'),
			tables: count('table'),
			rows: count('tr'),
			cells: count('th, td'),
			links: count('[data-streamdown="link"]'),
			linkText: Array.from(root.querySelectorAll('[data-streamdown="link"]')).map(
				(link) => link.textContent,
			),
			codeBlocks: count('pre'),
			katex: count('.katex'),
			strong: count('strong'),
			emphasis: count('em'),
			blockquotes: count('blockquote'),
		};
	}, expectedMarker);
}

async function waitForSemanticCommit(page, expectedMarker, label) {
	try {
		await page.waitForFunction(
			(marker) => {
				const root = document.querySelector('.bench-shell');
				if (root === null || !root.textContent.includes(marker)) return false;
				const codeBlocks = root.querySelectorAll('[data-streamdown="code-block"]');
				const codeBodies = root.querySelectorAll('[data-streamdown="code-block-body"] code');
				return (
					codeBlocks.length === codeBodies.length &&
					Array.from(codeBodies).every((body) => body.textContent.trim().length > 0)
				);
			},
			expectedMarker,
			{ timeout: 10_000 },
		);
	} catch (error) {
		const diagnostics = await page.evaluate((marker) => {
			const root = document.querySelector('.bench-shell');
			const codeBlocks = root?.querySelectorAll('[data-streamdown="code-block"]') ?? [];
			const codeBodies = root?.querySelectorAll('[data-streamdown="code-block-body"] code') ?? [];
			return {
				codeBlocks: codeBlocks.length,
				codeBodyLengths: Array.from(codeBodies, (body) => body.textContent.trim().length),
				hasMarker: root?.textContent.includes(marker) ?? false,
			};
		}, expectedMarker);
		throw new Error(`${label} did not settle semantic output: ${JSON.stringify(diagnostics)}`, {
			cause: error,
		});
	}
}

async function openPreparedPage(context, target) {
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});

	await page.goto(target.url, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__benchReady === true);
	// Prime KaTeX and Shiki outside the timed operation. This starts from a
	// static tree because shrinking an incomplete streaming tree is the
	// separately tracked lifecycle failure described in this suite's README.
	await page.evaluate((content) => window.__renderMarkdown(content, 'static'), STATIC_A);
	await page.waitForSelector('[data-streamdown="code-block-body"] [style*="--shiki-dark"]', {
		timeout: 10_000,
	});
	await page.evaluate(() => window.__reset());
	return { page, errors };
}

async function probeStreamToStatic(context, target) {
	const probe = await openPreparedPage(context, target);
	await probe.page.evaluate((frames) => {
		for (const frame of frames) window.__renderMarkdown(frame, 'streaming');
	}, FINE_FRAMES);
	try {
		await probe.page.evaluate((content) => window.__renderMarkdown(content, 'static'), STATIC_A);
	} catch (error) {
		probe.errors.push(error instanceof Error ? error.message : String(error));
	}
	await sleep(100);
	const committed = await probe.page.evaluate(() =>
		document.body.textContent.includes('STATIC_A_COMPLETE'),
	);
	await probe.page.close();
	return {
		committed,
		errors: [...new Set(probe.errors)],
	};
}

function assertNoBrowserErrors(target, errors) {
	if (errors.length > 0) {
		throw new Error(`${target.name} browser errors:\n${errors.join('\n')}`);
	}
}

async function runTarget(target) {
	const browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--js-flags=--expose-gc'],
	});
	try {
		const context = await browser.newContext();
		const timings = {};
		const semantics = {};
		for (const op of OPS) {
			// One isolated warmup gives the operation's own hot path a JIT pass
			// without requiring a destructive transition out of streamed Markdown.
			const warmup = await openPreparedPage(context, target);
			await op.prepare(warmup.page);
			await op.run(warmup.page);
			await waitForSemanticCommit(
				warmup.page,
				op.expectedMarker,
				`${target.name} ${op.name} warmup`,
			);
			assertNoBrowserErrors(target, warmup.errors);
			await warmup.page.close();

			const samples = [];
			for (let iteration = 0; iteration < ITER; iteration += 1) {
				const sample = await openPreparedPage(context, target);
				await op.prepare(sample.page);
				await sleep(20);
				samples.push(await op.run(sample.page));
				await waitForSemanticCommit(
					sample.page,
					op.expectedMarker,
					`${target.name} ${op.name} sample ${iteration + 1}`,
				);
				semantics[op.name] = await semanticSnapshot(sample.page, op.expectedMarker);
				assertNoBrowserErrors(target, sample.errors);
				await sample.page.close();
			}
			timings[op.name] = summarizeSamples(samples);
		}

		const bytes = directoryBytes(target.dist);
		const lifecycle = await probeStreamToStatic(context, target);
		return { timings, semantics, bytes, lifecycle };
	} finally {
		await browser.close();
	}
}

function assertSemanticParity(results) {
	for (const op of OPS) {
		const baseline = JSON.stringify(results['react-streamdown'].semantics[op.name]);
		const candidate = JSON.stringify(results['octane-streamdown'].semantics[op.name]);
		if (baseline !== candidate) {
			throw new Error(
				`semantic DOM parity failed for ${op.name}\n` +
					`react-streamdown: ${baseline}\noctane-streamdown: ${candidate}`,
			);
		}
	}
	for (const target of TARGETS) {
		const lifecycle = results[target.name].lifecycle;
		if (!lifecycle.committed || lifecycle.errors.length > 0) {
			throw new Error(
				`${target.name} stream → static lifecycle failed\n` +
					`committed: ${lifecycle.committed}\n` +
					`errors: ${lifecycle.errors.length > 0 ? lifecycle.errors.join('\n') : '(none)'}`,
			);
		}
	}
}

function printResults(results, failure) {
	const columns = TARGETS.map((target) => target.name).filter(
		(name) => results[name] !== undefined,
	);
	const width = 30;
	console.log();
	if (columns.length === 0) {
		console.log(`correctness gate: ${failure === undefined ? 'PASS' : 'FAIL'}`);
		return;
	}
	console.log('Op             | ' + columns.map((column) => column.padEnd(width)).join('| '));
	console.log('---------------+-' + columns.map(() => '-'.repeat(width)).join('+-'));
	for (const op of OPS) {
		const cells = columns.map((column) => {
			const result = results[column].timings[op.name];
			return `${result.median.toFixed(2)} ms (min ${result.min.toFixed(2)})`.padEnd(width);
		});
		console.log(`${op.name.padEnd(15)}| ${cells.join('| ')}`);
	}
	for (const [label, key] of [
		['JS raw bytes', 'jsRaw'],
		['JS gzip bytes', 'jsGzip'],
		['CSS raw bytes', 'cssRaw'],
		['CSS gzip bytes', 'cssGzip'],
	]) {
		const cells = columns.map((column) => String(results[column].bytes[key]).padEnd(width));
		console.log(`${label.padEnd(15)}| ${cells.join('| ')}`);
	}
	const lifecycleCells = columns.map((column) =>
		(results[column].lifecycle.committed ? 'PASS' : 'FAIL').padEnd(width),
	);
	console.log(`${'stream → static'.padEnd(15)}| ${lifecycleCells.join('| ')}`);
	console.log(`correctness gate: ${failure === undefined ? 'PASS' : 'FAIL'}`);
}

const results = {};
const targetFailures = [];
for (const target of TARGETS) {
	console.error(`Running ${target.name} (${target.url}) × ${ITER}…`);
	try {
		results[target.name] = await runTarget(target);
	} catch (error) {
		targetFailures.push(
			`${target.name}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
let failure = targetFailures.length > 0 ? targetFailures.join('\n') : undefined;
if (failure === undefined) {
	try {
		assertSemanticParity(results);
	} catch (error) {
		failure = error instanceof Error ? error.message : String(error);
	}
}
printResults(results, failure);

if (process.env.BENCH_JSON) {
	const payload = {
		suite: 'streamdown-hosted',
		iterations: ITER,
		...(failure === undefined ? {} : { failed: failure }),
		targets: TARGETS.filter((target) => results[target.name] !== undefined).map((target) => {
			const result = results[target.name];
			return {
				name: target.name,
				ops: {
					...Object.fromEntries(
						Object.entries(result.timings).map(([name, timing]) => [
							name,
							timingStatForJson(timing),
						]),
					),
					bundle_js_raw: deterministicCount(result.bytes.jsRaw),
					bundle_js_gzip: deterministicCount(result.bytes.jsGzip),
					bundle_css_raw: deterministicCount(result.bytes.cssRaw),
					bundle_css_gzip: deterministicCount(result.bytes.cssGzip),
				},
				meta: {
					lifecycle: result.lifecycle,
					semantics: result.semantics,
				},
			};
		}),
	};
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
	console.error(`BENCH_JSON written to ${process.env.BENCH_JSON}`);
}

if (failure !== undefined) {
	console.error(failure);
	process.exitCode = 1;
}
