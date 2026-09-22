// Native option copies and selected reads during a public controlled update.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { launchBrowser } from '../../test-utils/playwright-browser.ts';
import { countStat, octanePackageAt, parseOptions, writePayload } from '../activity/harness.mjs';

const revision = parseOptions(process.argv.slice(2)).revision;
const source = octanePackageAt(revision);
const { compile } = await import(
	pathToFileURL(path.join(source.packageRoot, 'src/compiler/index.js'))
);
const fixture = fs.readFileSync(
	new URL('../../packages/octane/tests/_fixtures/view-transition-host-state.tsrx', import.meta.url),
	'utf8',
);
const compiled = compile(fixture, 'view-transition-host-state.tsrx', {
	mode: 'client',
	dev: false,
	hmr: false,
});
assert.deepEqual(compiled.diagnostics, []);
const result = await build({
	stdin: {
		contents: compiled.code + '\nexport { createRoot, startTransition, flushSync } from "octane";',
		resolveDir: source.packageRoot,
	},
	bundle: true,
	write: false,
	minify: true,
	format: 'iife',
	globalName: 'selectBenchmark',
	platform: 'browser',
	target: 'esnext',
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	plugins: [
		{
			name: 'selected-octane-source',
			setup(plugin) {
				plugin.onResolve({ filter: /^octane(?:\/internal\/client)?$/ }, ({ path: request }) => ({
					path: path.join(
						source.packageRoot,
						'src',
						request === 'octane' ? 'index.ts' : 'internal/client.ts',
					),
				}));
			},
		},
	],
});
const bundle = result.outputFiles[0].text;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const browser = await launchBrowser({ headless: true });
const output = {
	suite: 'view-transition-select',
	iterations: 2,
	metadata: {
		revision: source.revision,
		workingTree: !revision,
		node: process.version,
		chromium: browser.version(),
		bundleSha256: hash(bundle),
		fixtureSha256: hash(fixture),
		adapterSha256: hash(fs.readFileSync(path.join(source.packageRoot, 'src/dom-stage.ts'))),
		measurement:
			'Native importNode(option) calls and selected getter calls, from scheduled update through native transition completion; excludes mount, assertions and teardown. Counts delegate unchanged to native operations.',
	},
	targets: [],
};
try {
	for (const size of [128, 512]) {
		for (const mode of ['sync', 'transition-one', 'transition-all']) {
			const samples = [];
			// The unobserved warmup checks that instrumentation preserves the work.
			for (const observed of [false, true, true]) {
				const page = await browser.newPage();
				const errors = [];
				page.on('pageerror', (error) => errors.push(String(error)));
				try {
					await page.setContent(
						'<style>::view-transition-group(*) { animation-duration: 1ms; }</style><main></main>',
					);
					await page.addScriptTag({ content: bundle });
					const data = await page.evaluate(
						async ({ size, mode, observed }) => {
							const { createRoot, flushSync, startTransition, SelectStateApp } = selectBenchmark;
							const host = document.querySelector('main');
							const rows = Array.from({ length: size }, (_, index) => String(index));
							const root = createRoot(host);
							root.render(SelectStateApp, { rows, values: [], label: 'before' });
							const options = [...host.querySelectorAll('option')];
							const input = host.querySelector('input');
							input.value = 'user draft';
							const nativeStart = document.startViewTransition;
							const nativeImport = Document.prototype.importNode;
							const selected = Object.getOwnPropertyDescriptor(
								HTMLOptionElement.prototype,
								'selected',
							);
							let captures = 0,
								optionCopies = 0,
								selectedReads = 0;
							let resolve, reject;
							const finished = new Promise((done, fail) => {
								resolve = done;
								reject = fail;
							});
							const timer = setTimeout(
								() => reject(new Error('Native transition timed out')),
								30000,
							);
							const values = mode === 'transition-one' ? [rows.at(-1)] : rows;
							try {
								document.startViewTransition = function (options) {
									captures++;
									const transition = nativeStart.call(this, options);
									transition.finished.then(resolve, reject);
									return transition;
								};
								if (observed) {
									Document.prototype.importNode = function (node, deep) {
										if (node.nodeType === 1 && node.localName === 'option') optionCopies++;
										return Reflect.apply(nativeImport, this, [node, deep]);
									};
									Object.defineProperty(HTMLOptionElement.prototype, 'selected', {
										...selected,
										get() {
											selectedReads++;
											return Reflect.apply(selected.get, this, []);
										},
									});
								}
								const update = () => root.render(SelectStateApp, { rows, values, label: 'after' });
								if (mode === 'sync') flushSync(update);
								else {
									startTransition(update);
									await finished;
								}
							} finally {
								clearTimeout(timer);
								document.startViewTransition = nativeStart;
								Document.prototype.importNode = nativeImport;
								Object.defineProperty(HTMLOptionElement.prototype, 'selected', selected);
							}
							const current = [...host.querySelectorAll('option')];
							const semantic = {
								selection: current
									.filter((option) => option.selected)
									.map((option) => option.value),
								identity:
									current.every((option, index) => option === options[index]) &&
									current.length === size,
								draft: host.querySelector('input') === input && input.value === 'user draft',
								captures,
							};
							flushSync(() => root.unmount());
							return {
								optionCopies,
								selectedReads,
								semantic,
								unmounted: host.childNodes.length === 0,
							};
						},
						{ size, mode, observed },
					);
					assert.deepEqual(errors, []);
					assert.deepEqual(data.semantic, {
						selection:
							mode === 'transition-one'
								? [String(size - 1)]
								: Array.from({ length: size }, (_, index) => String(index)),
						identity: true,
						draft: true,
						captures: mode === 'sync' ? 0 : 1,
					});
					assert.equal(data.unmounted, true);
					if (observed) samples.push(data);
				} finally {
					await page.close();
				}
			}
			assert.deepEqual(samples[0], samples[1], 'Deterministic work must repeat exactly');
			const { optionCopies, selectedReads } = samples[0];
			output.targets.push({
				name: `${mode}-${size}`,
				ops: { option_copies: countStat(optionCopies), selected_reads: countStat(selectedReads) },
				meta: { size, semantic: samples[0].semantic, samples: samples.length },
			});
		}
	}
	writePayload(output);
	console.log(JSON.stringify(output, null, 2));
} finally {
	await browser.close();
}
