// Compile the same event workload against a selected checkout, then exercise
// its production browser bundle. Intrinsic slot-write instrumentation is only
// installed for the deterministic update sample, never the timing rounds.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, transformSync } from 'esbuild';
import { chromium } from 'playwright';
import ts from 'typescript';

const checkout = resolve(process.argv[2] ?? fileURLToPath(new URL('../..', import.meta.url)));
const { compile } = await import(
	pathToFileURL(resolve(checkout, 'packages/octane/src/compiler/compile.js'))
);
const sources = {
	one: `export function App(props) @{ <button onClick={(event) => {
		event.preventDefault(); props.log(props.value, event.type);
	}}>one</button> }`,
	two: `export function App({log, value}) @{ <button onClick={(event) => {
		event.preventDefault(); log(value, event.type);
	}}>two</button> }`,
	ordinary: `export function App({log, value, type}) @{ <button onClick={() => log(value, type)}>ordinary</button> }`,
	// Three captures retain the closure: there is no fixed field layout for a
	// larger environment, and replacing a closure with an array is not this win.
	large: `export function App({log, value, type}) @{ <button onClick={(event) => {
		event.preventDefault(); log(value, type);
	}}>large</button> }`,
};
const bundles = {};
const sizes = {};
function renderClosureSites(code) {
	let count = 0;
	const walk = (node, depth) => {
		if (ts.isArrowFunction(node) && depth > 0) count++;
		const nested = depth + Number(ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node));
		ts.forEachChild(node, (child) => walk(child, nested));
	};
	walk(
		ts.createSourceFile('event-output.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS),
		0,
	);
	return count;
}
for (const [name, source] of Object.entries(sources)) {
	const code = compile(source, `block-handler-${name}.tsrx`, { hmr: false, dev: false }).code;
	const minified = transformSync(code, { minify: true, loader: 'js' }).code;
	const result = await build({
		stdin: {
			contents: `${code}\nexport { createRoot, flushSync } from 'octane';`,
			resolveDir: checkout,
			sourcefile: `block-handler-${name}.mjs`,
		},
		bundle: true,
		write: false,
		minify: true,
		format: 'esm',
		platform: 'browser',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		plugins: [
			{
				name: 'selected-runtime',
				setup(build) {
					build.onResolve({ filter: /^octane$/ }, () => ({
						path: resolve(checkout, 'packages/octane/src/index.ts'),
					}));
				},
			},
		],
	});
	bundles[`/${name}.mjs`] = result.outputFiles[0].text;
	sizes[name] = {
		renderClosureSites: renderClosureSites(code),
		emitted: Buffer.byteLength(code),
		minified: Buffer.byteLength(minified),
		gzip: gzipSync(minified).length,
		bundle: Buffer.byteLength(bundles[`/${name}.mjs`]),
		bundleGzip: gzipSync(bundles[`/${name}.mjs`]).length,
	};
}
const server = createServer((request, response) => {
	response.setHeader(
		'Content-Type',
		request.url.endsWith('.mjs') ? 'text/javascript' : 'text/html',
	);
	response.end(bundles[request.url] ?? '<!doctype html><body></body>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
	browser = await chromium.launch({ headless: true });
	const results = {};
	for (const name of Object.keys(sources)) {
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${server.address().port}`);
		results[name] = await page.evaluate(async (name) => {
			const { App, createRoot, flushSync } = await import(`/${name}.mjs`);
			const container = document.createElement('main');
			document.body.append(container);
			const root = createRoot(container);
			let calls = 0;
			let last = null;
			const log = (...args) => {
				calls++;
				last = args;
			};
			const update = (value) => flushSync(() => root.render(App, { log, value, type: 'click' }));
			update(0);
			const button = container.querySelector('button');
			let slot = button.$$click;
			let writes = 0;
			Object.defineProperty(button, '$$click', {
				configurable: true,
				get: () => slot,
				set: (next) => {
					writes++;
					slot = next;
				},
			});
			for (let i = 1; i <= 128; i++) update(i);
			Object.defineProperty(button, '$$click', { value: slot, configurable: true, writable: true });
			const fire = () => {
				const event = new MouseEvent('click', { bubbles: true, cancelable: true });
				button.dispatchEvent(event);
				if (name !== 'ordinary' && !event.defaultPrevented) throw new Error('lost cancellation');
			};
			fire();
			if (calls !== 1 || last[0] !== 128 || last[1] !== 'click')
				throw new Error('capture/event mismatch');
			if (container.querySelector('button') !== button) throw new Error('remounted survivor');
			for (let i = 0; i < 1000; i++) fire();
			const dispatch = [];
			const updates = [];
			for (let round = 0; round < 20; round++) {
				let start = performance.now();
				for (let i = 0; i < 4000; i++) fire();
				dispatch.push(((performance.now() - start) * 1000) / 4000);
				start = performance.now();
				for (let i = 0; i < 500; i++) update(i);
				updates.push(((performance.now() - start) * 1000) / 500);
			}
			root.unmount();
			container.remove();
			return {
				updatesObserved: 128,
				writes,
				dispatchMicros: dispatch,
				updateMicros: updates,
				semantic: 'passed',
			};
		}, name);
		assert.deepEqual(errors, []);
		await page.close();
	}
	const report = { checkout, node: process.version, browser: browser.version(), sizes, results };
	if (process.env.BENCH_JSON) {
		const { writeFile } = await import('node:fs/promises');
		const value = (median) => ({ median, min: median, samples: 1 });
		await writeFile(
			process.env.BENCH_JSON,
			JSON.stringify(
				{
					suite: 'compiler-output',
					targets: [
						{
							name: 'handler-lifted',
							ops: {
								event_slot_writes: value(results.one.writes + results.two.writes),
								render_closure_sites: value(
									sizes.one.renderClosureSites + sizes.two.renderClosureSites,
								),
								emitted: value(sizes.one.minified + sizes.two.minified),
							},
							meta: {
								gate: 'passed',
								sourceHash: createHash('sha256').update(JSON.stringify(sources)).digest('hex'),
								semanticHash: createHash('sha256')
									.update(
										'128 updates; click capture 128; click event; native cancellation; survivor identity',
									)
									.digest('hex'),
							},
						},
						{
							name: 'handler-closure-control',
							ops: {
								event_slot_writes: value(results.large.writes * 2),
								render_closure_sites: value(sizes.large.renderClosureSites * 2),
								emitted: value(sizes.large.minified * 2),
							},
							meta: {
								gate: 'passed',
								sourceHash: createHash('sha256').update(JSON.stringify(sources)).digest('hex'),
								semanticHash: createHash('sha256')
									.update(
										'128 updates; click capture 128; click event; native cancellation; survivor identity',
									)
									.digest('hex'),
							},
						},
					],
				},
				null,
				2,
			),
		);
	}
	process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} finally {
	await browser?.close();
	await new Promise((resolve) => server.close(resolve));
}
