import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { launchBrowser } from '../../test-utils/playwright-browser.ts';
import { countStat, octanePackageAt, parseOptions, writePayload } from '../activity/harness.mjs';

const selected = octanePackageAt(parseOptions(process.argv.slice(2)).revision);
const sourceFiles = [
	'runtime.ts',
	'runtime/forms.ts',
	'runtime/commit.ts',
	'dom-stage.ts',
	'radio-group.ts',
	'signals/control-binding.ts',
]
	.map((file) => path.join(selected.packageRoot, 'src', file))
	.filter(existsSync);
const hashSources = () =>
	createHash('sha256')
		.update(sourceFiles.map((file) => readFileSync(file)).join('\0'))
		.digest('hex');
const hotPathSourceHash = hashSources();
const built = await build({
	entryPoints: [path.join(selected.packageRoot, 'src/index.ts')],
	bundle: true,
	write: false,
	format: 'iife',
	globalName: 'radioBenchmark',
	platform: 'browser',
	target: 'esnext',
	metafile: true,
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
});
const sourceInputs = Object.keys(built.metafile.inputs)
	.map((file) => realpathSync(path.resolve(file)))
	.filter((file) => file.includes('/packages/octane/src/'));
assert(sourceInputs.length > 0);
for (const file of sourceInputs)
	assert(
		file.startsWith(realpathSync(selected.packageRoot) + '/src/'),
		'Source escaped selected package: ' + file,
	);
const hashInputs = () =>
	createHash('sha256')
		.update(
			sourceInputs
				.map(
					(file) =>
						path.relative(selected.packageRoot, file) +
						'\0' +
						createHash('sha256').update(readFileSync(file)).digest('hex'),
				)
				.sort()
				.join('\n'),
		)
		.digest('hex');
const bundledSourceHash = hashInputs();
const toolingLockfileHash = createHash('sha256')
	.update(readFileSync(new URL('../../pnpm-lock.yaml', import.meta.url)))
	.digest('hex');
const browser = await launchBrowser({ headless: true, executablePath: process.env.RADIO_CHROME });
const output = {
	suite: 'controlled-form',
	iterations: 1,
	metadata: {
		revision: selected.revision,
		workingTree: !process.argv.some((arg) => arg.startsWith('--octane-revision=')),
		node: process.version,
		chromium: browser.version(),
		hotPathSourceHash,
		bundledSourceHash,
		toolingLockfileHash,
		sourceInputs,
	},
	targets: [],
};
try {
	const configurations = [
		...[128, 512].flatMap((size) =>
			['update', 'unchanged', 'reset', 'input', 'transition'].map((mode) => ({ size, mode })),
		),
		{ size: 128, mode: 'input', type: 'checkbox' },
		{ size: 128, mode: 'reset', texts: 512 },
		{ size: 128, mode: 'transition', texts: 512 },
		{ size: 128, mode: 'input', singleGroup: true },
	];
	for (const configuration of configurations) {
		const { size, mode, type = 'radio', texts = 0, singleGroup = false } = configuration;
		const samples = [];
		for (const observed of [false, true, true]) {
			const page = await browser.newPage();
			const errors = [];
			page.on('pageerror', (error) => errors.push(String(error)));
			try {
				await page.setContent(
					'<style>::view-transition-group(*){animation-duration:1ms}</style><main></main>',
				);
				await page.addScriptTag({ content: built.outputFiles[0].text });
				const result = await page.evaluate(
					async ({ size, mode, observed, type, texts, singleGroup }) => {
						const r = radioBenchmark,
							h = r.createElement;
						const host = document.querySelector('main');
						const root = r.createRoot(host);
						let tick = 0;
						const tree = () => {
							const form = h('form', {}, [
								...Array.from({ length: size }, (_, i) =>
									h('input', {
										key: i,
										type,
										name: singleGroup ? 'one-group' : 'q' + Math.floor(i / 2),
										checked: singleGroup ? i === tick : i % 2 === tick,
										readOnly: true,
									}),
								),
								...Array.from({ length: texts }, (_, i) =>
									h('input', { key: 'text' + i, type: 'text', defaultValue: 'field' + i }),
								),
							]);
							return mode === 'transition'
								? h(r.ViewTransition, { name: 'radio-work' }, form)
								: form;
						};
						r.flushSync(() => root.render(tree()));
						const nodes = [...host.querySelectorAll('input[type=' + type + ']')];
						if (mode === 'reset') {
							tick = 1;
							r.flushSync(() => root.render(tree()));
						}
						const counts = { checked_reads: 0, type_reads: 0, name_reads: 0, input_copies: 0 };
						const getters = ['checked', 'type', 'name'].map((key) => [
							key,
							Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, key),
						]);
						const nativeImport = Document.prototype.importNode;
						const nativeStart = document.startViewTransition;
						let captures = 0;
						let complete, reject;
						const finished = new Promise((resolve, fail) => {
							complete = resolve;
							reject = fail;
						});
						const timeout = setTimeout(() => reject(Error('Radio transition timed out')), 15000);
						try {
							if (observed) {
								for (const [key, descriptor] of getters)
									Object.defineProperty(HTMLInputElement.prototype, key, {
										...descriptor,
										get() {
											counts[key + '_reads']++;
											return descriptor.get.call(this);
										},
									});
								Document.prototype.importNode = function (node, deep) {
									if (node.nodeType === 1 && node.localName === 'input') counts.input_copies++;
									return Reflect.apply(nativeImport, this, [node, deep]);
								};
							}
							if (mode === 'transition') {
								document.startViewTransition = function (options) {
									captures++;
									const transition = nativeStart.call(this, options);
									transition.finished.then(complete, reject);
									return transition;
								};
								tick = 1;
								r.startTransition(() => root.render(tree()));
								await finished;
							} else if (mode === 'reset') {
								r.startTransition(() => r.requestFormReset(host.querySelector('form')));
								await Promise.resolve();
								r.flushSync(() => {});
							} else if (mode === 'input') {
								for (const node of nodes) node.click();
							} else {
								if (mode === 'update') tick = 1;
								r.flushSync(() => root.render(tree()));
							}
						} finally {
							clearTimeout(timeout);
							for (const [key, descriptor] of getters)
								Object.defineProperty(HTMLInputElement.prototype, key, descriptor);
							Document.prototype.importNode = nativeImport;
							document.startViewTransition = nativeStart;
						}
						const semantic = {
							values: nodes.every(
								(node, i) => node.checked === (singleGroup ? i === tick : i % 2 === tick),
							),
							identity: nodes.every(
								(node, i) => node === host.querySelectorAll('input[type=' + type + ']')[i],
							),
							captures,
						};
						root.unmount();
						return { counts, semantic, unmounted: host.childNodes.length === 0 };
					},
					{ size, mode, observed, type, texts, singleGroup },
				);
				assert.deepEqual(errors, []);
				assert.deepEqual(result.semantic, {
					values: true,
					identity: true,
					captures: mode === 'transition' ? 1 : 0,
				});
				assert.equal(result.unmounted, true);
				if (observed) samples.push(result);
			} finally {
				await page.close();
			}
		}
		assert.deepEqual(samples[0], samples[1], 'Native work counts must repeat exactly');
		output.targets.push({
			name: `${type}-${mode}-${size}${texts ? '-padded' : ''}${singleGroup ? '-one-group' : ''}`,
			ops: Object.fromEntries(
				Object.entries(samples[0].counts).map(([name, count]) => [name, countStat(count)]),
			),
			meta: { size, semantic: samples[0].semantic },
		});
	}
	assert.equal(hashSources(), hotPathSourceHash, 'Hot-path source changed during measurement');
	assert.equal(hashInputs(), bundledSourceHash, 'Bundled source changed during measurement');
	writePayload(output);
	console.log(JSON.stringify(output, null, 2));
} finally {
	await browser.close();
}
