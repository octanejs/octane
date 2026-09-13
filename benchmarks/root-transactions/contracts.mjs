// Deliberately invalid alternatives demonstrate why the root journal cannot be
// armed after the first raw throw or restored from a previous binding cache.
// They exist only in in-memory bundles; authored runtime source stays untouched.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const repo = resolve(import.meta.dirname, '../..');
const sourceRoot = resolve(process.argv.slice(2).find((arg) => !arg.startsWith('--')) || repo);
const runtimeFile = join(sourceRoot, 'packages/octane/src/runtime.ts');
const fixtureFile = join(repo, 'packages/octane/tests/_fixtures/suspense-preserves-dom.tsrx');
const runtimeSource = await readFile(runtimeFile, 'utf8');
const fixtureSource = await readFile(fixtureFile, 'utf8');
const { compile } = await import(
	pathToFileURL(join(sourceRoot, 'packages/octane/src/compiler/compile.js'))
);
const output = join(repo, 'node_modules/.cache/root-contracts');
await mkdir(output, { recursive: true });
const hash = (value) => createHash('sha256').update(value).digest('hex');

function replaceOnce(source, previous, next) {
	assert.equal(source.split(previous).length - 1, 1, `Expected exactly one ${previous}`);
	return source.replace(previous, next);
}

function instrument(variant) {
	let source = runtimeSource;
	if (variant === 'native') return source;
	if (variant === 'delayed-driver') {
		source = replaceOnce(
			source,
			'let ROOT_RENDER_TRANSACTION: RootRenderTransaction | null = null;',
			'let AUDIT_ROOT_DRIVER = false;\nlet ROOT_RENDER_TRANSACTION: RootRenderTransaction | null = null;',
		);
		source = replaceOnce(
			source,
			'WIP_CAPTURE = transaction.capture;\n\treturn frame;',
			`WIP_CAPTURE = transaction.capture;
	// Keep only the owner shell required by existing root request entry points.
	// A real nullable driver would also omit this shell; it cannot recover writes
	// that happened before installation any more than this idealized version can.
	if (!AUDIT_ROOT_DRIVER && owner.current?.mounted) {
		ROOT_RENDER_TRANSACTION = null;
		TRANSITION_JOURNAL = null;
		TRANSITION_JOURNAL_BAGS = null;
		TRANSITION_JOURNAL_DEPTH = 0;
		WIP_CAPTURE = null;
	}
	return frame;`,
		);
		const signature = `function suspendRootRender(
	block: Block,
	wakeable: PromiseLike<unknown>,
	attempt: TransitionAttempt | null,
): boolean {`;
		source = replaceOnce(source, signature, signature + '\n\tAUDIT_ROOT_DRIVER = true;');
	}
	const reads = variant === 'binding-cache' ? 'cached' : 'live';
	if (source.includes('function journalText(node: Text, previous: string | null)')) {
		source = replaceOnce(
			source,
			'journalText(node, node.nodeValue)',
			`journalText(node, globalThis.__rootContractAudit.${reads}Text(node))`,
		);
	} else {
		source = replaceOnce(
			source,
			'TRANSITION_JOURNAL!.push(JOURNAL_TEXT, node, node.nodeValue, null);',
			`TRANSITION_JOURNAL!.push(JOURNAL_TEXT, node, globalThis.__rootContractAudit.${reads}Text(node), null);`,
		);
	}
	source = replaceOnce(
		source,
		'TRANSITION_JOURNAL!.push(JOURNAL_ATTR, el, name, el.getAttribute(name));',
		`TRANSITION_JOURNAL!.push(JOURNAL_ATTR, el, name, globalThis.__rootContractAudit.${reads}Attr(el, name));`,
	);
	return source;
}

async function bundle(variant, dev) {
	const source = instrument(variant);
	const built = await build({
		stdin: {
			contents: `export {RawRootSuspensionAfterSiblingApp as App, DescriptorRootSuspensionAfterSiblingApp as DescriptorApp} from ${JSON.stringify(fixtureFile)};
export {createRoot, flushSync, act} from 'octane';`,
			resolveDir: sourceRoot,
		},
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		minify: !dev,
		define: {
			'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		nodePaths: [join(repo, 'packages/octane/node_modules'), join(repo, 'node_modules')],
		plugins: [
			{
				name: 'isolated-root-contract-experiment',
				setup(builder) {
					builder.onResolve({ filter: /^octane$/ }, () => ({
						path: join(sourceRoot, 'packages/octane/src/index.ts'),
					}));
					builder.onResolve({ filter: /^octane\/internal\/client$/ }, () => ({
						path: join(sourceRoot, 'packages/octane/src/internal/client.ts'),
					}));
					builder.onLoad({ filter: /\/runtime\.ts$/ }, ({ path }) => {
						if (path === runtimeFile) return { contents: source, loader: 'ts' };
					});
					builder.onLoad({ filter: /\.tsrx$/ }, ({ path }) => {
						assert.equal(path, fixtureFile);
						return {
							contents: compile(fixtureSource, fixtureFile, { hmr: false, dev }).code,
							loader: 'js',
						};
					});
				},
			},
		],
	});
	const code = built.outputFiles[0].text;
	const path = join(output, `${variant}-${dev ? 'dev' : 'prod'}-${hash(code)}.mjs`);
	await writeFile(path, code);
	return path;
}

async function exercise(path, scenario) {
	const window = new Window({ url: 'http://localhost/' });
	for (const name of [
		'document',
		'Node',
		'Element',
		'HTMLElement',
		'SVGElement',
		'Comment',
		'Text',
		'Event',
		'MutationObserver',
	])
		globalThis[name] = window[name];
	globalThis.window = window;
	const textCache = new WeakMap();
	const attrCache = new WeakMap();
	const reads = { text: 0, attribute: 0 };
	const isTarget = (el) => el?.id === 'raw-root-suspension-label';
	globalThis.__rootContractAudit = {
		liveText(node) {
			if (isTarget(node.parentNode)) reads.text++;
			return node.nodeValue;
		},
		liveAttr(el, name) {
			if (isTarget(el) && name === 'title') reads.attribute++;
			return el.getAttribute(name);
		},
		cachedText(node) {
			return textCache.has(node) ? textCache.get(node) : this.liveText(node);
		},
		cachedAttr(el, name) {
			return attrCache.get(el)?.has(name) ? attrCache.get(el).get(name) : this.liveAttr(el, name);
		},
	};
	const runtime = await import(pathToFileURL(path).href + '?scenario=' + scenario);
	const container = document.createElement('main');
	document.body.appendChild(container);
	const root = runtime.createRoot(container);
	let value = 'A';
	let resolvePending;
	const pending = new Promise((resolve) => (resolvePending = resolve));
	const read = () => {
		if (value === null) throw pending;
		return value;
	};
	try {
		root.render(runtime.App, { label: 'original', read });
		runtime.flushSync(() => {});
		const label = container.querySelector('#raw-root-suspension-label');
		const text = label.firstChild;
		const reader = container.querySelector('#raw-root-suspension-reader');
		textCache.set(text, text.nodeValue);
		attrCache.set(label, new Map([['title', label.getAttribute('title')]]));
		let expectedText = 'original';
		let expectedTitle = 'original';
		if (scenario !== 'first-raw-throw') {
			expectedText = 'external text';
			expectedTitle =
				scenario === 'absent-attribute'
					? null
					: scenario === 'empty-attribute'
						? ''
						: 'external title';
			text.nodeValue = expectedText;
			if (expectedTitle === null) label.removeAttribute('title');
			else label.setAttribute('title', expectedTitle);
		}
		reads.text = 0;
		reads.attribute = 0;
		value = null;
		runtime.flushSync(() => root.render(runtime.App, { label: 'replacement', read }));
		const held = {
			text: label.textContent,
			title: label.getAttribute('title'),
			present: label.hasAttribute('title'),
			reader: reader.textContent,
			identity:
				container.querySelector('#raw-root-suspension-label') === label &&
				label.firstChild === text,
		};
		const expected = {
			text: expectedText,
			title: expectedTitle,
			present: expectedTitle !== null,
			reader: 'resource:A',
			identity: true,
		};
		const holdReads = { ...reads };
		value = 'B';
		await runtime.act(() => resolvePending('ready'));
		assert.equal(label.textContent, 'replacement');
		assert.equal(label.getAttribute('title'), 'replacement');
		assert.equal(reader.textContent, 'resource:B');
		assert.equal(container.querySelector('#raw-root-suspension-label'), label);
		return {
			held,
			expected,
			preserved: JSON.stringify(held) === JSON.stringify(expected),
			reads: holdReads,
		};
	} finally {
		root.unmount();
		assert.equal(container.childNodes.length, 0);
		container.remove();
		await window.happyDOM.close();
		delete globalThis.__rootContractAudit;
	}
}

async function exerciseReads(path, appName) {
	const window = new Window({ url: 'http://localhost/' });
	for (const name of [
		'document',
		'Node',
		'Element',
		'HTMLElement',
		'SVGElement',
		'Comment',
		'Text',
		'Event',
		'MutationObserver',
	])
		globalThis[name] = window[name];
	globalThis.window = window;
	const runtime = await import(pathToFileURL(path).href + '?reads=' + appName);
	const App = runtime[appName];
	const container = document.createElement('main');
	document.body.appendChild(container);
	const root = runtime.createRoot(container);
	const read = () => 'A';
	try {
		root.render(App, { label: '0', read });
		runtime.flushSync(() => {});
		const label = container.querySelector('#raw-root-suspension-label');
		const text = label.firstChild;
		let prototype = Object.getPrototypeOf(text);
		let descriptor;
		while (!(descriptor = Object.getOwnPropertyDescriptor(prototype, 'nodeValue')))
			prototype = Object.getPrototypeOf(prototype);
		let reads = 0;
		Object.defineProperty(text, 'nodeValue', {
			configurable: true,
			get() {
				reads++;
				return Reflect.apply(descriptor.get, this, []);
			},
			set(value) {
				Reflect.apply(descriptor.set, this, [value]);
			},
		});
		for (let index = 1; index <= 128; index++)
			runtime.flushSync(() => root.render(App, { label: String(index), read }));
		const changed = reads;
		reads = 0;
		for (let index = 1; index <= 128; index++)
			runtime.flushSync(() => root.render(App, { label: '128', read }));
		const equal = reads;
		delete text.nodeValue;
		assert.equal(label.textContent, '128');
		assert.equal(label.getAttribute('title'), '128');
		assert.equal(container.querySelector('#raw-root-suspension-label'), label);
		assert.equal(label.firstChild, text);
		assert.equal(container.querySelector('#raw-root-suspension-reader').textContent, 'resource:A');
		return { app: appName, iterations: 128, changed, equal };
	} finally {
		root.unmount();
		assert.equal(container.childNodes.length, 0);
		container.remove();
		await window.happyDOM.close();
	}
}

const results = [];
const reads = [];
const nativeArtifact = await bundle('native', false);
for (const app of ['App', 'DescriptorApp']) reads.push(await exerciseReads(nativeArtifact, app));
for (const dev of process.argv.includes('--reads-only') ? [] : [true, false]) {
	for (const variant of ['live', 'delayed-driver', 'binding-cache']) {
		const artifact = await bundle(variant, dev);
		const scenarios =
			variant === 'delayed-driver'
				? ['first-raw-throw']
				: ['first-raw-throw', 'external-attribute', 'absent-attribute', 'empty-attribute'];
		for (const scenario of scenarios) {
			const result = await exercise(artifact, scenario);
			assert.equal(
				result.preserved,
				variant === 'live' || (variant === 'binding-cache' && scenario === 'first-raw-throw'),
			);
			results.push({ mode: dev ? 'development' : 'production', variant, scenario, ...result });
		}
	}
}
const report = {
	suite: 'root-transactions',
	sourceRoot,
	runtimeHash: hash(runtimeSource),
	fixtureHash: hash(fixtureSource),
	node: process.version,
	reads,
	results,
	targets: reads.flatMap((row) => {
		const stat = (median) => ({ median, min: median, samples: 1 });
		const name = row.app === 'App' ? 'text-compiled' : 'text-descriptor';
		return [
			{
				name,
				ops: { changed_reads: stat(row.changed), equal_reads: stat(row.equal) },
				meta: { gate: 'passed' },
			},
			{
				name: `${name}-work`,
				ops: { changed_reads: stat(row.iterations), equal_reads: stat(row.iterations) },
				meta: { gate: 'passed' },
			},
		];
	}),
};
if (process.env.BENCH_JSON)
	await writeFile(resolve(process.env.BENCH_JSON), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
