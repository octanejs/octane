// Deterministic component-work guard, with supplemental synchronous DOM timing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { compile } from '../../packages/octane/src/compiler/compile.js';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const here = import.meta.dirname;
const root = path.resolve(here, '../..');
const iterations = process.argv.includes('--quick') ? 3 : 9;
const updates = process.argv.includes('--quick') ? 100 : 1000;
const fault = process.argv.includes('--fault-component-read');
const fixture = path.join(here, 'dom-bindings.tsrx');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const exportsMap = JSON.parse(
	fs.readFileSync(path.join(root, 'packages/octane/package.json')),
).exports;
const source = fs.readFileSync(fixture, 'utf8');
const compiled = compile(
	fault
		? source.replace(
				'left: props.left$, right: props.right$',
				'left: props.left$.get(), right: props.right$.get()',
			)
		: source,
	fixture,
	{ dev: false, hmr: false },
);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-dom-bindings-'));
const dom = new Window();
const priorGlobals = new Map();
let payload;
try {
	for (const name of [
		'window',
		'document',
		'Node',
		'Element',
		'HTMLElement',
		'SVGElement',
		'Text',
		'Comment',
		'Event',
		'MutationObserver',
		'requestAnimationFrame',
		'cancelAnimationFrame',
	]) {
		priorGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value:
				typeof dom[name] === 'function' && name.endsWith('AnimationFrame')
					? dom[name].bind(dom)
					: name === 'window'
						? dom
						: dom[name],
		});
	}
	function observeStyles(source) {
		const body =
			'function nativeStyleBody(props: { el: HTMLElement | SVGElement; value: any }, scope: Scope): void {';
		const block =
			"const block = createBlock('control-flow', owner.block, el, null, null, body, props);";
		assert.equal(source.split(body).length, 2, 'one native style body observation site');
		assert.equal(source.split(block).length, 2, 'one native presentation allocation site');
		return source
			.replace(body, body + '\n globalThis.__plainStyleWork.bodies++;')
			.replace(block, 'globalThis.__plainStyleWork.blocks++; ' + block);
	}
	async function bundle(observed) {
		return build({
			absWorkingDir: root,
			stdin: {
				contents: `export { DirectStyles, SampledStyles, PlainStyles } from './dom-bindings.tsrx'; export { createRoot, flushSync } from 'octane'; export { createScope } from 'octane/signals';`,
				resolveDir: here,
			},
			bundle: true,
			format: 'esm',
			platform: 'browser',
			write: false,
			minify: true,
			metafile: true,
			logLevel: 'silent',
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			plugins: [
				{
					name: 'compiled-fixture',
					setup(plugin) {
						plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
							const target = exportsMap[request === 'octane' ? '.' : '.' + request.slice(6)];
							assert.equal(typeof target, 'string', 'public authored source export');
							return { path: path.resolve(root, 'packages/octane', target) };
						});
						plugin.onLoad({ filter: /dom-bindings\.tsrx$/ }, () => ({
							contents: compiled.code,
							loader: 'js',
							resolveDir: here,
						}));
						if (observed)
							plugin.onLoad({ filter: /\/runtime\.ts$/ }, ({ path: file }) => ({
								contents: observeStyles(fs.readFileSync(file, 'utf8')),
								loader: 'ts',
								resolveDir: path.dirname(file),
							}));
					},
				},
			],
		});
	}
	const bundled = await bundle(false);
	const code = bundled.outputFiles[0].text;
	const output = path.join(scratch, 'fixture.mjs');
	fs.writeFileSync(output, code);
	const api = await import(pathToFileURL(output).href);
	const observedBundle = await bundle(true);
	const observedFile = path.join(scratch, 'observed.mjs');
	fs.writeFileSync(observedFile, observedBundle.outputFiles[0].text);
	priorGlobals.set(
		'__plainStyleWork',
		Object.getOwnPropertyDescriptor(globalThis, '__plainStyleWork'),
	);
	Object.defineProperty(globalThis, '__plainStyleWork', {
		configurable: true,
		writable: true,
		value: { blocks: 0, bodies: 0 },
	});
	const observed = await import(pathToFileURL(observedFile).href);
	const targets = [];
	for (const [name, Component] of [
		['direct', api.DirectStyles],
		['sampled', api.SampledStyles],
		['plain', api.PlainStyles],
	]) {
		const scope = api.createScope({ scopeKey: name });
		const left$ = scope.signal$('left', 0);
		const right$ = scope.signal$('right', 0);
		const container = document.createElement('div');
		document.body.appendChild(container);
		const view = api.createRoot(container);
		let calls = 0;
		const timings = [];
		try {
			view.render(Component, {
				left: 0,
				right: 0,
				left$,
				right$,
				record: () => {
					calls++;
				},
			});
			const host = container.querySelector('div');
			const child = host.firstChild;
			for (let round = 0; round < iterations + 2; round++) {
				calls = 0;
				const start = performance.now();
				for (let i = 1; i <= updates; i++) {
					const value = round * updates + i;
					api.flushSync(() => {
						if (name === 'plain') {
							view.render(Component, {
								left: value,
								right: value + 1,
								record: () => {
									calls++;
								},
							});
							return;
						}
						left$.set(value);
						right$.set(value + 1);
					});
				}
				const elapsed = ((performance.now() - start) * 1000) / updates;
				assert.equal(host.style.left, `${(round + 1) * updates}px`);
				assert.equal(host.style.right, `${(round + 1) * updates + 1}px`);
				assert.equal(host.style.color, 'red');
				assert.equal(container.querySelector('div'), host);
				assert.equal(host.firstChild, child);
				assert.equal(child.textContent, 'stable');
				if (round >= 2) timings.push(elapsed);
			}
			const observedScope = observed.createScope({ scopeKey: 'work-' + name });
			const observedLeft$ = observedScope.signal$('left', 0);
			const observedRight$ = observedScope.signal$('right', 0);
			const observedContainer = document.createElement('div');
			document.body.appendChild(observedContainer);
			const observedView = observed.createRoot(observedContainer);
			const observedComponent =
				observed[
					name === 'direct' ? 'DirectStyles' : name === 'sampled' ? 'SampledStyles' : 'PlainStyles'
				];
			let styleWork;
			try {
				globalThis.__plainStyleWork = { blocks: 0, bodies: 0 };
				observedView.render(observedComponent, {
					left: 0,
					right: 0,
					left$: observedLeft$,
					right$: observedRight$,
					record: () => {},
				});
				const initial = observedContainer.querySelector('div');
				const initialChild = initial.firstChild;
				const mountedStyleBlocks = globalThis.__plainStyleWork.blocks;
				globalThis.__plainStyleWork = { blocks: 0, bodies: 0 };
				for (let i = 1; i <= updates; i++)
					observed.flushSync(() => {
						const value = (iterations + 1) * updates + i;
						if (name === 'plain')
							observedView.render(observedComponent, {
								left: value,
								right: value + 1,
								record: () => {},
							});
						else {
							observedLeft$.set(value);
							observedRight$.set(value + 1);
						}
					});
				assert.equal(initial.outerHTML, host.outerHTML, 'work probes preserve public CSS and text');
				assert.equal(initial.style.color, 'red');
				assert.equal(initialChild.textContent, 'stable');
				assert.equal(observedContainer.querySelector('div'), initial);
				assert.equal(initial.firstChild, initialChild);
				styleWork = { blocks: mountedStyleBlocks, bodies: globalThis.__plainStyleWork.bodies };
				if (name === 'direct') {
					assert.ok(
						styleWork.blocks > 0 && styleWork.bodies > 0,
						'direct handle styles exercise both work observers',
					);
				}
				observedView.unmount();
				observed.flushSync(() => observedLeft$.set(-1));
				assert.equal(observedContainer.textContent, '');
				assert.equal(initial.style.left, `${(iterations + 2) * updates}px`);
			} finally {
				observedView.unmount();
				observedContainer.remove();
				observedScope.dispose();
			}
			targets.push({
				name,
				ops: {
					setup_calls: { score: calls, mean: calls, median: calls, min: calls },
					update_us: timingStatForJson(summarizeSamples(timings, { scoreMode: 'mean' })),
					style_blocks: {
						score: styleWork.blocks,
						median: styleWork.blocks,
						min: styleWork.blocks,
						samples: 1,
					},
					style_update_bodies: {
						score: styleWork.bodies,
						median: styleWork.bodies,
						min: styleWork.bodies,
						samples: 1,
					},
				},
			});
			assert.equal(
				calls,
				name === 'direct' ? 0 : updates,
				'Direct styles bypass setup; sampled styles rerun it',
			);
			view.unmount();
			api.flushSync(() => left$.set(-1));
			assert.equal(container.textContent, '');
			assert.equal(host.style.left, `${(iterations + 2) * updates}px`);
		} finally {
			view.unmount();
			container.remove();
			scope.dispose();
		}
	}
	payload = {
		suite: 'signal-dom-bindings',
		iterations,
		updates,
		targets,
		meta: {
			node: process.version,
			platform: process.platform,
			arch: process.arch,
			fixtureSha256: hash(source),
			compiledSha256: hash(compiled.code),
			bundleSha256: hash(code),
			bundleBytes: Buffer.byteLength(code),
			observedBundleSha256: hash(observedBundle.outputFiles[0].text),
			inputs: Object.keys(bundled.metafile.inputs)
				.filter((file) => file !== '<stdin>')
				.map((file) => ({ path: file, sha256: hash(fs.readFileSync(path.resolve(root, file))) })),
			limits:
				'Synchronous happy-dom work; no browser layout or paint. Compiled-source decisions precede style work probes; observed bundles are excluded from size/timing. Setup/style-work ratios are deterministic; timing is supplemental.',
		},
	};
	console.log(JSON.stringify({ suite: payload.suite, iterations, updates, targets }, null, 2));
} catch (error) {
	payload = { suite: 'signal-dom-bindings', failed: error.stack ?? String(error) };
	throw error;
} finally {
	if (payload && process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
	for (const [name, descriptor] of priorGlobals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else delete globalThis[name];
	}
	dom.close();
	fs.rmSync(scratch, { recursive: true, force: true });
}
