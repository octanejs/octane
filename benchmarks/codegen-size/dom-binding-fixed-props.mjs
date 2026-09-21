// The same imported presentation is compiled with and without its caller's
// primitive proofs. Public adoption/mounting, updates and disposal are controls;
// byte ratios cover generated modules separately from complete runtime bundles.
import { compile } from 'octane/compiler';
import { build, transformSync, version as esbuildVersion } from 'esbuild';
import { Window } from 'happy-dom';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'packages/octane/tests/_fixtures');
const CHILD = path.join(DIR, 'dom-presentation-fixed-child.tsrx');
const PRESENTATION = path.join(DIR, 'fixed-primitives-presentation.tsrx');
const ACTIVATION = path.join(DIR, 'fixed-primitives-activation.tsrx');
const source = readFileSync(CHILD, 'utf8');
const keys = ['variant', 'radius', 'label', 'title', 'active', 'onClick', 'ref'];
const fixed = [
	['variant', 'ghost'],
	['radius', 'full'],
	['label', 'Go'],
];
const presentation = `import { FixedChild } from './dom-presentation-fixed-child.tsrx';
export function Presentation(props) @{ 'use dom bindings';
<section><FixedChild variant="ghost" radius="full" label="Go" title={props.title} active={props.active} onClick={props.onClick} ref={props.ref} /></section> }`;
const activation = `import { adoptBindings, mountBindings } from 'octane/behavior';
import { Presentation } from './fixed-primitives-presentation.tsrx';
export function attach(root, source) { return adoptBindings(root, Presentation, source); }
export function mount(parent, source) { return mountBindings({ parent }, Presentation, source); }`;
const options = { dev: false, hmr: false, mode: 'client' };
const value = (median) => ({ median, mean: median, min: median, max: median, samples: [median] });
const bytes = (code) => ({
	raw: value(Buffer.byteLength(code)),
	minified: value(Buffer.byteLength(transformSync(code, { minify: true }).code)),
	gzip: value(gzipSync(transformSync(code, { minify: true }).code, { level: 9 }).length),
});

function childSize(specialized) {
	const shape = specialized ? [2, keys, fixed] : [1, keys];
	const id =
		CHILD +
		'?octane-bindings=FixedChild&octane-mount=1&octane-props=' +
		encodeURIComponent(JSON.stringify(shape));
	return bytes(compile(source, id, options).code);
}

async function bundle(directory, name, mode, specialized) {
	const outfile = path.join(directory, name + '.mjs');
	await build({
		stdin: {
			contents:
				mode === 'server'
					? `import { renderToString } from 'octane/server'; import { Presentation } from './fixed-primitives-presentation.tsrx'; export function html(props) { return renderToString(Presentation, props).html; }`
					: compile(activation, ACTIVATION, options).code,
			resolveDir: DIR,
			sourcefile: ACTIVATION,
		},
		outfile,
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'es2022',
		minify: true,
		legalComments: 'none',
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		plugins: [
			{
				name: 'public-binding-fixture',
				setup(plugin) {
					plugin.onResolve({ filter: /\.tsrx(?:\?|$)/ }, (args) => ({
						path: path.resolve(args.resolveDir, args.path),
						namespace: 'binding-fixture',
					}));
					plugin.onLoad({ filter: /.*/, namespace: 'binding-fixture' }, (args) => {
						const file = args.path.split('?')[0];
						let id = args.path;
						if (!specialized && file === CHILD && id.includes('?')) {
							const query = new URLSearchParams(id.slice(id.indexOf('?') + 1));
							const shape = JSON.parse(query.get('octane-props'));
							query.set('octane-props', JSON.stringify([1, shape[1]]));
							id = file + '?' + query;
						}
						return {
							contents: compile(file === PRESENTATION ? presentation : source, id, {
								...options,
								mode,
							}).code,
							loader: 'js',
							resolveDir: DIR,
						};
					});
				},
			},
		],
	});
	return {
		module: await import(pathToFileURL(outfile)),
		bytes: bytes(readFileSync(outfile, 'utf8')),
	};
}

export async function measureFixedChildPrograms() {
	const directory = mkdtempSync(path.join(tmpdir(), 'octane-fixed-child-'));
	const window = new Window({ url: 'http://localhost/' });
	const globals = new Map();
	for (const name of [
		'window',
		'document',
		'Node',
		'Element',
		'HTMLElement',
		'HTMLButtonElement',
		'SVGElement',
		'Text',
		'Comment',
		'Event',
		'MouseEvent',
		'MutationObserver',
	]) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: name === 'window' ? window : name === 'document' ? window.document : window[name],
		});
	}
	try {
		const server = await bundle(directory, 'server', 'server', false);
		const outputs = [];
		const targets = [];
		for (const specialized of [false, true]) {
			const name = specialized ? 'fixed-child' : 'generic-child';
			const client = await bundle(directory, name, 'client', specialized);
			const states = [];
			for (const mount of [false, true]) {
				let click = 0,
					subscriptions = new Set();
				let props = {
					title: 'Initial',
					active: false,
					onClick: () => {
						click++;
					},
				};
				const source = {
					getSnapshot: () => props,
					subscribe(notify) {
						subscriptions.add(notify);
						return () => subscriptions.delete(notify);
					},
				};
				const host = document.createElement('div');
				document.body.append(host);
				if (!mount) host.innerHTML = server.module.html(props);
				const adopted = host.querySelector('button');
				const handle = mount
					? client.module.mount(host, source)
					: client.module.attach(host.firstElementChild, source);
				const button = host.querySelector('button');
				if (!mount) assert.equal(button, adopted);
				assert.equal(button.textContent, 'Go');
				assert.equal(button.className, 'base ghost rounded');
				props = { ...props, title: 'Changed', active: true };
				for (const notify of subscriptions) notify();
				assert.equal(host.querySelector('button'), button);
				assert.equal(button.title, 'Changed');
				assert.equal(button.className, 'base ghost rounded active');
				button.click();
				assert.equal(click, 1);
				states.push([button.textContent, button.title, button.className, click]);
				handle.dispose();
				assert.equal(subscriptions.size, 0);
				button.click();
				assert.equal(click, 1);
				host.remove();
			}
			outputs.push(states);
			targets.push(
				{ name, ops: childSize(specialized) },
				{ name: name + '-bundle', ops: client.bytes },
			);
		}
		assert.deepEqual(outputs[0], outputs[1]);
		const meta = {
			semanticSha256: createHash('sha256').update(JSON.stringify(outputs[0])).digest('hex'),
			sourceSha256: createHash('sha256').update(source).digest('hex'),
			node: process.version,
			esbuild: esbuildVersion,
		};
		return { targets: targets.map((target) => ({ ...target, meta })) };
	} finally {
		for (const [name, descriptor] of globals)
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		await window.happyDOM.close();
		rmSync(directory, { recursive: true, force: true });
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const payload = {
		suite: 'dom-binding-fixed-props',
		iterations: 1,
		...(await measureFixedChildPrograms()),
	};
	console.table(
		Object.fromEntries(
			payload.targets.map(({ name, ops }) => [
				name,
				Object.fromEntries(Object.entries(ops).map(([key, value]) => [key, value.median])),
			]),
		),
	);
	if (process.env.BENCH_JSON)
		writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}
