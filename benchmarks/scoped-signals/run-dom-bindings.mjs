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
	const bundled = await build({
		absWorkingDir: root,
		stdin: {
			contents: `export { DirectStyles, SampledStyles } from './dom-bindings.tsrx'; export { createRoot, flushSync } from 'octane'; export { createScope } from 'octane/signals';`,
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
					plugin.onLoad({ filter: /dom-bindings\.tsrx$/ }, () => ({
						contents: compiled.code,
						loader: 'js',
						resolveDir: here,
					}));
				},
			},
		],
	});
	const code = bundled.outputFiles[0].text;
	const output = path.join(scratch, 'fixture.mjs');
	fs.writeFileSync(output, code);
	const api = await import(pathToFileURL(output).href);
	const targets = [];
	for (const [name, Component] of [
		['direct', api.DirectStyles],
		['sampled', api.SampledStyles],
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
			targets.push({
				name,
				ops: {
					setup_calls: { score: calls, mean: calls, median: calls, min: calls },
					update_us: timingStatForJson(summarizeSamples(timings, { scoreMode: 'mean' })),
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
			inputs: Object.keys(bundled.metafile.inputs)
				.filter((file) => file !== '<stdin>')
				.map((file) => ({ path: file, sha256: hash(fs.readFileSync(path.resolve(root, file))) })),
			limits:
				'Synchronous happy-dom work; no browser layout or paint. Setup-call ratios are deterministic; timing is supplemental.',
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
