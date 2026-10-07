// Exercise the Rspack adapter's imported void-root proof with the runtime
// bundled: the saving is the generic returned-value renderer that a proven root
// lets the minifier drop. Each pair compiles identical authored source with the
// same loaders. In the control, a later loader routes the root's import through
// a plain re-export module, an edge the adapter deliberately leaves unproven.
// Every other module must stay byte-identical, so the size delta is the root
// proof alone, and both variants must render the same DOM in jsdom.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zc, gzipSync } from 'node:zlib';
import rspack from '@rspack/core';
import { OctaneRspackPlugin } from '@octanejs/rspack-plugin';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const val = (bytes) => ({ median: bytes, min: bytes, samples: 1 });
const VOID_ROOT_HELPERS = { createRoot: '__createVoidRoot', hydrateRoot: '__hydrateVoidRoot' };
const REEXPORT = './root-reexport.js';

// A post loader over the entry, after SWC. The control passes it the root's
// import request to rewrite; the proven variant runs it as a no-op, so the two
// configurations differ only in its options.
function rerouteLoader(source) {
	const { from, to } = this.getOptions();
	if (from === undefined) return source;
	let count = 0;
	const next = source.replace(/(["'])([^"'\n]+)\1/g, (quoted, quote, request) =>
		request === from ? (count++, quote + to + quote) : quoted,
	);
	if (count !== 1) throw new Error(`expected one ${from} import, found ${count}`);
	return next;
}

const SCENARIOS = {
	// octanejs/octane#1839: one hydrated leaf imported from a compiled module.
	hydrate: {
		files: {
			'Greeting.tsrx': `export function Greeting() @{ <p>Hello</p>; }`,
			'entry.ts': `/** @jsxImportSource octane */
import { hydrateRoot } from 'octane';
import { Greeting } from './Greeting.tsrx';
export function start(container: HTMLElement) {
	const root = hydrateRoot(container, Greeting, {});
	return {
		unmount() {
			root.unmount();
		},
	};
}`,
		},
		root: './Greeting.tsrx',
		factory: 'hydrateRoot',
		serverHtml: '<p>Hello</p>',
		expected: ['<p>Hello</p>'],
	},
	// A created root over a tree of imported void components with props.
	tree: {
		files: {
			'Header.tsrx': `export function Header({ title }: { title: string }) @{
	<header><h1>{title as string}</h1></header>;
}`,
			'Item.tsrx': `export function Item({ label }: { label: string }) @{
	<li class="item">{label as string}</li>;
}`,
			'List.tsrx': `import { Item } from './Item.tsrx';
export function List({ items }: { items: string[] }) @{
	<ul>
		@for (const label of items; key label) {
			<Item label={label} />
		}
	</ul>;
}`,
			'App.tsrx': `import { Header } from './Header.tsrx';
import { List } from './List.tsrx';
export function App({ title, items }: { title: string; items: string[] }) @{
	<main>
		<Header title={title} />
		<List items={items} />
	</main>;
}`,
			'entry.ts': `/** @jsxImportSource octane */
import { createRoot } from 'octane';
import { App } from './App.tsrx';
export function start(container: HTMLElement) {
	const root = createRoot(container);
	root.render(App, { title: 'Rows', items: ['a', 'b', 'c'] });
	return {
		update() {
			root.render(App, { title: 'Moved', items: ['c', 'a', 'd'] });
		},
		unmount() {
			root.unmount();
		},
	};
}`,
		},
		root: './App.tsrx',
		factory: 'createRoot',
		serverHtml: '',
		expected: [
			'<main><header><h1>Rows</h1></header><ul><!--for--><li class="item">a</li><li class="item">b</li><li class="item">c</li><!--/for--></ul></main>',
			'<main><header><h1>Moved</h1></header><ul><!--for--><li class="item">c</li><li class="item">a</li><li class="item">d</li><!--/for--></ul></main>',
		],
	},
};

function write(root, filename, source) {
	const target = path.join(root, filename);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, source);
	return target;
}

function createFixture(parent, name) {
	const scenario = SCENARIOS[name];
	const root = path.join(parent, name);
	write(
		root,
		'package.json',
		JSON.stringify({
			name: `octane-rspack-void-${name}-sentinel`,
			type: 'module',
			sideEffects: false,
			dependencies: { octane: '*' },
		}),
	);
	fs.mkdirSync(path.join(root, 'node_modules'));
	fs.symlinkSync(
		path.join(REPO, 'packages/octane'),
		path.join(root, 'node_modules/octane'),
		process.platform === 'win32' ? 'junction' : 'dir',
	);
	for (const [filename, source] of Object.entries(scenario.files)) write(root, filename, source);
	write(root, REEXPORT, `export * from ${JSON.stringify(scenario.root)};`);
	const loader = write(root, 'reroute-loader.cjs', `module.exports = ${rerouteLoader};`);
	const source = Object.entries(scenario.files)
		.map(([filename, code]) => `// ${filename}\n${code}`)
		.join('\n');
	return { root, name, scenario, loader, source, buildNumber: 0 };
}

/** Record each fixture module's final loader output once the graph is sealed. */
function captureSources(root, sources) {
	return {
		apply(compiler) {
			compiler.hooks.thisCompilation.tap('VoidRootSentinelSources', (compilation) => {
				compilation.hooks.seal.tap('VoidRootSentinelSources', () => {
					sources.clear();
					for (const module of compilation.modules) {
						const resource = module.resource;
						if (typeof resource !== 'string' || !resource.startsWith(root + path.sep)) continue;
						if (resource.includes(`${path.sep}node_modules${path.sep}`)) continue;
						const source = module.originalSource()?.source();
						if (source != null) sources.set(path.relative(root, resource), String(source));
					}
				});
			});
		},
	};
}

async function buildFixture(fixture, variant) {
	const directory = path.join(fixture.root, `dist-${++fixture.buildNumber}`);
	const options = variant === 'control' ? { from: fixture.scenario.root, to: REEXPORT } : {};
	const sources = new Map();
	const compiler = rspack({
		context: fixture.root,
		mode: 'production',
		target: 'web',
		entry: './entry.ts',
		devtool: false,
		cache: false,
		// The fixture bundles the authored workspace runtime, whose TypeScript
		// modules use their published JavaScript import spelling.
		resolve: { extensionAlias: { '.js': ['.ts', '.js'] } },
		output: {
			path: directory,
			filename: 'main.js',
			globalObject: 'globalThis',
			library: { name: 'voidRootSentinel', type: 'var' },
		},
		module: {
			rules: [
				{
					test: path.join(fixture.root, 'entry.ts'),
					enforce: 'post',
					use: [{ loader: fixture.loader, options }],
				},
			],
		},
		// Only the minifier removes the runtime code no import reaches, so an
		// unminified build keeps both variants near the whole runtime's size.
		optimization: { minimize: true, splitChunks: false, runtimeChunk: false },
		plugins: [
			new OctaneRspackPlugin({ hmr: false, dev: false, parallel: false }),
			captureSources(fixture.root, sources),
		],
	});
	const scripts = await new Promise((resolve, reject) => {
		compiler.run((error, result) => {
			let captured;
			let failure = error;
			if (!failure) {
				try {
					if (!result) throw new Error('Rspack completed without stats.');
					if (result.hasErrors()) {
						throw new Error(result.toString({ all: false, errors: true }));
					}
					captured = result.compilation
						.getAssets()
						.map((asset) => asset.name)
						.filter((name) => name.endsWith('.js'));
				} catch (error) {
					failure = error;
				}
			}
			compiler.close((closeError) => {
				if (failure || closeError) return reject(failure ?? closeError);
				resolve(captured);
			});
		});
	});
	assert.deepEqual(scripts, ['main.js']);
	// The adapter, not the fixture, decides the variant: the proven entry must
	// call the specialized root and the control must keep the public factory.
	const { factory } = fixture.scenario;
	const helper = VOID_ROOT_HELPERS[factory];
	const entrySource = sources.get('entry.ts');
	const publicFactory = new RegExp(`\\b${factory}\\b`);
	if (variant === 'proven') {
		assert.ok(entrySource.includes(helper), `${fixture.name}: proven entry lacks ${helper}`);
		assert.doesNotMatch(
			entrySource,
			publicFactory,
			`${fixture.name}: proven entry kept ${factory}`,
		);
	} else {
		assert.ok(!entrySource.includes(helper), `${fixture.name}: control entry was specialized`);
		assert.match(entrySource, publicFactory, `${fixture.name}: control entry lost ${factory}`);
		assert.ok(entrySource.includes(REEXPORT), `${fixture.name}: control was not rerouted`);
	}
	const code = fs.readFileSync(path.join(directory, 'main.js'));
	return { code, sources };
}

/** Run the bundle in jsdom; record each committed DOM and whether hydration adopted it. */
async function render(fixture, code) {
	const { serverHtml, expected } = fixture.scenario;
	const dom = new JSDOM(
		`<!doctype html><html><body><div id="root">${serverHtml}</div></body></html>`,
		{ runScripts: 'outside-only', url: 'https://fixture.test/' },
	);
	const errors = [];
	dom.virtualConsole.on('error', (message) => errors.push(String(message)));
	dom.virtualConsole.on('jsdomError', (error) => errors.push(String(error)));
	try {
		const container = dom.window.document.getElementById('root');
		const adopted = container.firstChild;
		dom.window.eval(code.toString('utf8'));
		const api = dom.window.voidRootSentinel;
		const mounted = api.start(container);
		const html = [container.innerHTML];
		const identity = adopted === null ? null : container.firstChild === adopted;
		if (mounted.update !== undefined) {
			// Only the first render() mounts synchronously; let the update commit.
			mounted.update();
			await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
			html.push(container.innerHTML);
		}
		mounted.unmount();
		html.push(container.innerHTML);
		assert.deepEqual(errors, [], `${fixture.name}: console errors`);
		assert.deepEqual(html, [...expected, ''], `${fixture.name}: rendered DOM`);
		return { html, adoptedServerNode: identity };
	} finally {
		dom.window.close();
	}
}

function compressedSizes(code) {
	return {
		minified: code.length,
		gzip: gzipSync(code, { level: zc.Z_BEST_COMPRESSION }).length,
		brotli: brotliCompressSync(code, {
			params: { [zc.BROTLI_PARAM_QUALITY]: zc.BROTLI_MAX_QUALITY },
		}).length,
	};
}

export async function measureRspackVoidRoots() {
	const parent = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'octane-rspack-void-size-')));
	const targets = [];
	const summary = {
		provenance: {
			nodeExecutable: process.execPath,
			node: process.version,
			zlib: process.versions.zlib,
			brotli: process.versions.brotli,
			rspack: require('@rspack/core/package.json').version,
			jsdom: require('jsdom/package.json').version,
			gzipLevel: zc.Z_BEST_COMPRESSION,
			brotliQuality: zc.BROTLI_MAX_QUALITY,
			measuredRuntime: 'bundled',
			cache: false,
			parallel: false,
		},
		scenarios: {},
	};
	try {
		for (const name of Object.keys(SCENARIOS)) {
			const fixture = createFixture(parent, name);
			const scenarioSummary = { fixtureChecksum: hash(fixture.source), variants: {} };
			summary.scenarios[name] = scenarioSummary;
			const rendered = {};
			const modules = {};
			for (const variant of ['control', 'proven']) {
				const { code, sources } = await buildFixture(fixture, variant);
				modules[variant] = sources;
				rendered[variant] = await render(fixture, code);
				const sizes = compressedSizes(code);
				scenarioSummary.variants[variant] = sizes;
				targets.push({
					name: `rspack-void-${name}-${variant}`,
					ops: Object.fromEntries(Object.entries(sizes).map(([op, value]) => [op, val(value)])),
				});
			}
			// Only the root's proof differs: every other module, including each
			// component call the adapter proved inside the tree, is identical.
			const unchanged = (sources) =>
				[...sources].filter(([file]) => file !== 'entry.ts' && file !== path.normalize(REEXPORT));
			assert.deepEqual(unchanged(modules.proven), unchanged(modules.control));
			const authored = Object.keys(fixture.scenario.files).sort();
			assert.deepEqual([...modules.proven.keys()].sort(), authored);
			assert.deepEqual(
				[...modules.control.keys()].sort(),
				[...authored, path.normalize(REEXPORT)].sort(),
			);
			assert.deepEqual(rendered.proven, rendered.control, `${name}: void root proofs changed DOM`);
			if (fixture.scenario.serverHtml !== '') {
				assert.equal(rendered.proven.adoptedServerNode, true, `${name}: hydration replaced DOM`);
			}
			scenarioSummary.semanticChecksum = hash(JSON.stringify(rendered.control));
			for (const target of targets.filter((target) =>
				target.name.startsWith(`rspack-void-${name}-`),
			)) {
				target.meta = {
					provenance: summary.provenance,
					scenario: name,
					fixtureChecksum: scenarioSummary.fixtureChecksum,
					semanticChecksum: scenarioSummary.semanticChecksum,
				};
			}
		}
		return { targets, summary };
	} finally {
		fs.rmSync(parent, { recursive: true, force: true });
	}
}
