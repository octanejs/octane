// SSR metadata/guard controls. Observers count executed source operations, not
// engine allocations. Clean bundles own output and optional latency samples.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

process.env.NODE_ENV = 'production';
const repo = path.resolve(import.meta.dirname, '../..');
const sourceRoot = path.resolve(process.env.SSR_SOURCE_ROOT || repo);
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = require('esbuild');
const { compile } = await import(
	pathToFileURL(path.join(repo, 'packages/octane/src/compiler/index.js'))
);
const original = fs.readFileSync(
	path.join(sourceRoot, 'packages/octane/src/runtime.server.ts'),
	'utf8',
);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-final-metadata-'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const stat = (value) => ({ score: value, median: value, min: value, samples: 1 });
const count = 128;
const source = `
import { isChildrenBlock } from 'octane';
export function Mapped(p) @{ <ul>{p.items.map(row => <li data-id={row.id}>{row.label}</li>)}</ul> }
export function Row(p) @{ <li data-id={p.id}>{p.label as string}</li> }
export function Keyed(p) @{ <ul>@for(const row of p.items; key row.id) { <Row id={row.id} label={row.label}/> }</ul> }
function Wrap(p) @{ <section data-kind={isChildrenBlock(p.children) ? 'template' : 'callback'}>{isChildrenBlock(p.children) ? p.children : p.children('render-prop')}</section> }
export function Children(p) @{ <Wrap><b>{p.label as string}</b></Wrap> }
export function Callback() @{ <Wrap>{label => <i>{label}</i>}</Wrap> }
export function SpreadAttrs(p) @{ <input {...p.attrs} title={p.label}/> }
export function DirectAttrs(p) @{ <input placeholder={p.label} tabIndex={p.index} data-testid={p.label} title={p.label}/> }
`;
fs.writeFileSync(
	path.join(temp, 'fixture.js'),
	compile(source, 'final-metadata.tsrx', { mode: 'server', hmr: false, dev: false }).code,
);

function replaceOnce(source, needle, replacement) {
	assert.equal(source.split(needle).length, 2, 'observer site: ' + needle);
	return source.replace(needle, replacement);
}
function instrument(source) {
	for (const [needle, replacement] of [
		[
			'const descriptor = Object.getOwnPropertyDescriptor(receiver, index);',
			'globalThis.__metadataWork.element_descriptors++; const descriptor = Object.getOwnPropertyDescriptor(receiver, index);',
		],
		[
			"Object.getOwnPropertyDescriptor(Array.prototype, 'constructor')?.value !== Array",
			"(globalThis.__metadataWork.constructor_probes++, Object.getOwnPropertyDescriptor(Array.prototype, 'constructor')?.value) !== Array",
		],
		[
			'Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get !== NATIVE_ARRAY_SPECIES_GETTER',
			'(globalThis.__metadataWork.species_probes++, Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get) !== NATIVE_ARRAY_SPECIES_GETTER',
		],
		[
			'function nextFrameOccurrence(frame: Frame, base: string): number {',
			'function nextFrameOccurrence(frame: Frame, base: string): number { globalThis.__metadataWork.occurrences++;',
		],
		[
			'if (ASYNC_SCOPE === frame.asyncScope) return frame.nextChild++;',
			'if (ASYNC_SCOPE === frame.asyncScope) { globalThis.__metadataWork.direct_segments++; return frame.nextChild++; } globalThis.__metadataWork.scoped_segments++;',
		],
		[
			"const position = prev + '|@' + siteKey;",
			"globalThis.__metadataWork.identity_membranes++; const position = prev + '|@' + siteKey;",
		],
		[
			'function asyncIdentityKey(value: unknown, objectIs: boolean, positionFallback?: string): string {',
			'function asyncIdentityKey(value: unknown, objectIs: boolean, positionFallback?: string): string { globalThis.__metadataWork.identity_key_encodings++;',
		],
		[
			'return { hp, list, index };',
			'globalThis.__metadataWork.hook_positions++; return { hp, list, index };',
		],
		[
			'const render = (): string => {',
			'globalThis.__metadataWork.descriptor_render_closures += 2; const render = (): string => {',
		],
		[
			'export function encodeAsyncIdentityString(value: string): string {',
			'export function encodeAsyncIdentityString(value: string): string { globalThis.__metadataWork.encoded_units += value.length;',
		],
		[
			'const lower = name.toLowerCase();',
			'globalThis.__metadataWork.attribute_lowercase++; const lower = name.toLowerCase();',
		],
		[
			"const identity = namespace === 'html' ? name.toLowerCase() : name;",
			"const identity = namespace === 'html' ? (globalThis.__metadataWork.aggregate_attribute_lowercase++, name.toLowerCase()) : name;",
		],
		[
			"return parserNamespacesForTag(tag, parent?.childrenNamespace ?? FRAME?.namespace ?? 'html');",
			"globalThis.__metadataWork.namespace_records++; return parserNamespacesForTag(tag, parent?.childrenNamespace ?? FRAME?.namespace ?? 'html');",
		],
		[
			'const parentElement = CURRENT_SSR_ELEMENT;',
			'globalThis.__metadataWork.host_contexts++; globalThis.__metadataWork.host_tag_lowercase++; const parentElement = CURRENT_SSR_ELEMENT;',
		],
		[
			'const p = copyElementConfig(src);',
			'globalThis.__metadataWork.descriptor_props++; const p = copyElementConfig(src);',
		],
		[
			'(fn as any)[CHILDREN_BLOCK] = true;',
			'globalThis.__metadataWork.children_marks++; (fn as any)[CHILDREN_BLOCK] = true;',
		],
	])
		source = replaceOnce(source, needle, replacement);
	return source;
}
function rejected(source, kind) {
	if (kind === 'shared-hook-position')
		return (
			replaceOnce(
				source,
				'return { hp, list, index };',
				'auditHookPosition.hp = hp; auditHookPosition.list = list; auditHookPosition.index = index; return auditHookPosition;',
			) + '\nconst auditHookPosition: any = {};\n'
		);
	if (kind === 'skip-element-guards')
		return replaceOnce(
			source,
			'if (descriptor === undefined || descriptor.get !== undefined) return false;',
			'if (descriptor === undefined) return false;',
		);
	if (kind === 'skip-constructor-guard')
		return replaceOnce(source, "hasOwnProp.call(receiver, 'constructor') ||", '');
	if (kind === 'skip-species-guard')
		return replaceOnce(
			source,
			'Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get !== NATIVE_ARRAY_SPECIES_GETTER',
			'false',
		);
	if (kind === 'unscoped-child-segments')
		return replaceOnce(
			source,
			"return nextScopedCount(frame, 'scopedChildren', ASYNC_SCOPE);",
			'return frame.nextChild++;',
		);
	if (kind === 'skip-children-mark')
		return replaceOnce(source, '(fn as any)[CHILDREN_BLOCK] = true;', '');
	return source;
}
function lowerScan(source) {
	source = replaceOnce(
		source,
		'const lower = name.toLowerCase();',
		'const lower = auditLowercase(name);',
	);
	return (
		source +
		`\nfunction auditLowercase(name: string): string { for (let i = 0; i < name.length; i++) { const code = name.charCodeAt(i); if (code >= 65 && code <= 90) return name.toLowerCase(); } return name; }\n`
	);
}
function hostCache(source) {
	const start = source.indexOf(
		'\tif (!VALID_TAG_NAME.test(tag))',
		source.indexOf('function ssrHostElement('),
	);
	const end = source.indexOf('\tCURRENT_SSR_ELEMENT = {', start);
	assert.ok(start > 0 && end > start);
	source =
		source.slice(0, start) +
		`	const parentElement = CURRENT_SSR_ELEMENT;
	const { semanticTag, namespace, childrenNamespace } = auditHostMetadata(tag, parentElement?.childrenNamespace ?? FRAME?.namespace ?? 'html');
` +
		source.slice(end);
	return (
		source +
		`
const auditHostCaches = { html: new Map(), svg: new Map(), mathml: new Map() };
function auditHostMetadata(tag: string, inherited: ParserNamespace) {
  const cache = auditHostCaches[inherited];
  let metadata = cache.get(tag);
  if (metadata === undefined) {
    if (!VALID_TAG_NAME.test(tag)) throw new Error(formatServerError(30, tag));
    const semanticTag = tag.toLowerCase();
    metadata = { semanticTag, ...parserNamespacesForTag(semanticTag, inherited) };
    if (cache.size === 64) cache.clear();
    cache.set(tag, metadata);
  }
  return metadata;
}
`
	);
}
async function bundle(kind) {
	const output = await build({
		stdin: {
			contents: `export * from ${JSON.stringify(path.join(sourceRoot, 'packages/octane/src/server/index.ts'))}; export * as fixture from ${JSON.stringify(path.join(temp, 'fixture.js'))}; export { prerender } from ${JSON.stringify(path.join(sourceRoot, 'packages/octane/src/static/index.ts'))};`,
			resolveDir: repo,
			sourcefile: 'metadata-entry.js',
		},
		bundle: true,
		write: false,
		minify: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		nodePaths: [path.join(repo, 'packages/octane/node_modules'), path.join(repo, 'node_modules')],
		plugins: [
			{
				name: 'metadata-source',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/(?:server|internal\/server))?$/ }, () => ({
						path: path.join(sourceRoot, 'packages/octane/src/server/index.ts'),
					}));
					if (kind === 'observed')
						plugin.onLoad({ filter: /sanitize-url\.js$/ }, () => ({
							contents: fs
								.readFileSync(path.join(sourceRoot, 'packages/octane/src/sanitize-url.js'), 'utf8')
								.replace(
									'tag = tag === undefined ? undefined : tag.toLowerCase();',
									'tag = tag === undefined ? undefined : (globalThis.__metadataWork.url_tag_lowercase++, tag.toLowerCase());',
								)
								.replace(
									'name = name.toLowerCase();',
									'globalThis.__metadataWork.url_attribute_lowercase++; name = name.toLowerCase();',
								),
							loader: 'js',
						}));
					plugin.onLoad({ filter: /runtime\.server\.ts$/ }, () => ({
						contents:
							kind === 'observed'
								? instrument(original)
								: kind === 'lower-scan'
									? lowerScan(original)
									: kind === 'host-cache'
										? hostCache(original)
										: rejected(original, kind),
						loader: 'ts',
					}));
				},
			},
		],
	});
	const text = output.outputFiles[0].text;
	const file = path.join(temp, kind + '.mjs');
	fs.writeFileSync(file, text);
	return {
		rt: await import(pathToFileURL(file)),
		bytes: Buffer.byteLength(text),
		gzip: gzipSync(text).length,
		sha256: hash(text),
	};
}
const counters = [
	'url_tag_lowercase',
	'url_attribute_lowercase',
	'aggregate_attribute_lowercase',
	'namespace_records',
	'host_tag_lowercase',
	'element_descriptors',
	'constructor_probes',
	'species_probes',
	'occurrences',
	'direct_segments',
	'scoped_segments',
	'hook_positions',
	'identity_membranes',
	'identity_key_encodings',
	'descriptor_render_closures',
	'encoded_units',
	'attribute_lowercase',
	'host_contexts',
	'descriptor_props',
	'children_marks',
];
const rows = Array.from({ length: count }, (_, id) => ({ id: 'row-' + id, label: 'label<&' + id }));
function workload(rt, name) {
	const h = rt.createElement;
	if (name === 'hooks') {
		function HookRow(p) {
			const [value, update] = rt.useState(0);
			if (value === 0) update(1);
			return h('li', { 'data-id': p.id }, String(value));
		}
		return rt.renderToString(() =>
			h(
				'ul',
				null,
				rows.map((row) => h(HookRow, row)),
			),
		);
	}
	if (name === 'mapped') return rt.renderToString(rt.fixture.Mapped, { items: rows });
	if (name === 'keyed') return rt.renderToString(rt.fixture.Keyed, { items: rows });
	if (name === 'children')
		return rt.renderToString(() =>
			h(
				'main',
				null,
				rows.map((row) => h(rt.fixture.Children, row)),
			),
		);
	if (name === 'unique-hosts')
		return rt.renderToString(() =>
			h(
				'main',
				null,
				rows.map((row, index) => h('x-row-' + index, { title: row.label }, row.label)),
			),
		);
	if (name === 'hosts')
		return rt.renderToString(() =>
			h(
				'main',
				null,
				rows.map((row, index) =>
					h('input', { placeholder: row.label, tabIndex: index, 'data-testid': row.id }),
				),
			),
		);
	if (name === 'spread-attributes')
		return rt.renderToString(() =>
			h(
				'main',
				null,
				rows.map((row, index) =>
					h(rt.fixture.SpreadAttrs, {
						...row,
						attrs: { placeholder: row.label, tabIndex: index, 'data-testid': row.id },
					}),
				),
			),
		);
	if (name === 'attributes')
		return rt.renderToString(() =>
			h(
				'main',
				null,
				rows.map((row, index) => h(rt.fixture.DirectAttrs, { ...row, index })),
			),
		);
	const nested = name === 'nested-descriptors';
	return rt.renderToString(() =>
		h(
			'ul',
			null,
			rows.map((row, index) => {
				const props =
					index % 5 === 0
						? { ...row, title: row.label }
						: index % 5 === 1
							? { ...row, className: ['row', 'active'] }
							: index % 5 === 2
								? { ...row, tabIndex: index }
								: index % 5 === 3
									? { ...row, 'data-row': index }
									: { ...row, draggable: true };
				const child = h(rt.fixture.Row, { ...props, key: row.id });
				return nested ? h(rt.Fragment, { key: 'group:' + index }, child) : child;
			}),
		),
	);
}
function control(rt) {
	const h = rt.createElement;
	const visible = (node) => rt.renderToStaticMarkup(node).html;
	const log = [];
	const items = [
		{ id: 'a', label: 'A' },
		{ id: 'b', label: 'B' },
	];
	Object.defineProperty(items, '0', {
		configurable: true,
		get() {
			log.push('get:0');
			return { id: 'a', label: 'A' };
		},
	});
	const mapped = rt.renderToStaticMarkup(rt.fixture.Mapped, { items }).html;
	assert.equal(mapped, '<ul><li data-id="a">A</li><li data-id="b">B</li></ul>');
	assert.deepEqual(log, ['get:0']);
	const growing = [
		{ id: 'a', label: 'A' },
		{ id: 'b', label: 'B' },
	];
	Object.defineProperty(growing, '0', {
		get() {
			growing.push({ id: 'c', label: 'C' });
			return { id: 'a', label: 'A' };
		},
	});
	assert.equal(
		rt.renderToStaticMarkup(rt.fixture.Mapped, { items: growing }).html,
		mapped,
		'native map snapshots length before invoking accessors',
	);
	const withConstructor = [{ id: 'c', label: 'C' }];
	Object.defineProperty(withConstructor, 'constructor', {
		get() {
			log.push('constructor');
			return Array;
		},
	});
	assert.ok(
		rt.renderToStaticMarkup(rt.fixture.Mapped, { items: withConstructor }).html.includes('>C</li>'),
	);
	assert.deepEqual(log, ['get:0', 'constructor']);
	const speciesDescriptor = Object.getOwnPropertyDescriptor(Array, Symbol.species);
	let speciesReads = 0;
	const speciesHtml = rt.renderToStaticMarkup(function SpeciesRoot(_, scope) {
		try {
			Object.defineProperty(Array, Symbol.species, {
				configurable: true,
				get() {
					speciesReads++;
					return function Result(length) {
						const result = new Array(length + 1);
						result[length] = h('li', { 'data-id': 'species' }, 'extra');
						return result;
					};
				},
			});
			return rt.fixture.Mapped({ items: [{ id: 's', label: 'S' }] }, scope);
		} finally {
			Object.defineProperty(Array, Symbol.species, speciesDescriptor);
		}
	}).html;
	assert.equal(speciesHtml, '<ul><li data-id="s">S</li><li data-id="species">extra</li></ul>');
	assert.ok(speciesReads > 0, 'native map observes replaced species');
	const sparse = [{ id: 'a', label: 'A' }, , { id: 'b', label: 'B' }];
	assert.equal(rt.renderToStaticMarkup(rt.fixture.Mapped, { items: sparse }).html, mapped);
	const mutable = [{ id: 'a', label: 'before' }];
	rt.renderToStaticMarkup(rt.fixture.Mapped, { items: mutable });
	Object.defineProperty(mutable, '0', {
		get() {
			log.push('mutated getter');
			return { id: 'b', label: 'after' };
		},
	});
	assert.ok(
		rt.renderToStaticMarkup(rt.fixture.Mapped, { items: mutable }).html.includes('>after</li>'),
	);
	assert.equal(log.at(-1), 'mutated getter');
	assert.equal(
		rt.renderToStaticMarkup(rt.fixture.Children, { label: 'fresh' }).html,
		'<section data-kind="template"><b>fresh</b></section>',
	);
	assert.equal(
		rt.renderToStaticMarkup(rt.fixture.Callback).html,
		'<section data-kind="callback"><i>render-prop</i></section>',
	);
	const host = visible(
		h(
			'main',
			null,
			h(
				'svg',
				null,
				h('foreignObject', null, h('input', { defaultValue: 'inside', disabled: true })),
			),
			h('x-card', { className: 'raw', 'data-value': false }),
			h('INPUT', { defaultValue: 'outside', disabled: true }),
			h('a', { href: '' }, 'link'),
			h('img', { src: '' }),
			h('textarea', { defaultValue: '\nvalue' }),
			h(
				'select',
				{ defaultValue: 'b' },
				h('option', { value: 'a' }, 'A'),
				h('option', { value: 'b' }, 'B'),
			),
		),
	);
	assert.ok(host.includes('<input disabled="" value="inside"/>'));
	assert.ok(host.includes('<INPUT disabled="" value="outside"/>'));
	assert.ok(host.includes('<x-card class="raw" data-value="false"></x-card>'));
	assert.ok(host.includes('<a href="">link</a><img/>'));
	assert.ok(host.includes('<textarea>\n\nvalue</textarea>'));
	assert.ok(host.includes('<option value="b" selected>B</option>'));
	assert.throws(() => visible(h('div><img', null)), /Invalid tag|Octane error/);
	let nested;
	const outer = visible(
		h(
			'svg',
			null,
			h(
				'title',
				{
					title: {
						toString() {
							nested = visible(h('input', { defaultValue: 'nested' }));
							return 'outer';
						},
					},
				},
				'SVG',
			),
		),
	);
	assert.equal(nested, '<input value="nested"/>');
	assert.ok(outer.includes('title="outer"'));
	const namespaces = visible(
		h(
			'main',
			null,
			h('x-node', { disabled: true }),
			h(
				'svg',
				null,
				h('x-node', { disabled: true }),
				h('foreignObject', null, h('x-node', { disabled: true })),
			),
		),
	);
	assert.equal(
		namespaces,
		'<main><x-node disabled></x-node><svg><x-node disabled=""></x-node><foreignObject><x-node disabled></x-node></foreignObject></svg></main>',
	);
	function Inspect(p) {
		return h('code', null, Object.keys(p).join(','));
	}
	assert.equal(
		visible(h(Inspect, { value: 'x' })),
		'<code>value</code>',
		'descriptor props retain authored own-key presence',
	);
	function InnerHook() {
		const [value] = rt.useState(7);
		return h('b', null, String(value));
	}
	let memoVersion = 0;
	function ReentrantHook() {
		const [value, update] = rt.useState(0);
		const memo = rt.useMemo(() => {
			rt.renderToString(InnerHook);
			return 'memo:' + ++memoVersion;
		}, []);
		if (value === 0) update(1);
		return h('output', null, value + ':' + memo);
	}
	assert.equal(
		visible(h(ReentrantHook)),
		'<output>1:memo:1</output>',
		'memo storage keeps its owner across a reentrant factory and render-phase retry',
	);
	function Forward(p) {
		return h('span', { children: 'default', ...p });
	}
	assert.equal(visible(h(Forward)), '<span>default</span>');
	assert.equal(visible(h(Forward, { children: undefined })), '<span></span>');
	return { mapped, host, outer, nested, namespaces, log };
}
async function asyncControl(rt) {
	const h = rt.createElement;
	const deferred = () => {
		let resolve;
		const promise = new Promise((done) => {
			resolve = done;
		});
		return { promise, resolve };
	};
	const a = deferred(),
		b = deferred();
	let order = ['a', 'b'];
	let visited = false;
	const rows = { a: { id: 'a', value: a.promise }, b: { id: 'b', value: b.promise } };
	function Value(p) {
		visited = true;
		return h('li', { 'data-id': p.id }, rt.use(p.value));
	}
	function Root() {
		return h(
			'ul',
			null,
			order.map((id) => h(Value, { ...rows[id], key: id })),
		);
	}
	const pending = rt.prerender(Root);
	await Promise.resolve();
	assert.ok(visited, 'first pending render has begun');
	order = ['b', 'a'];
	a.resolve('A');
	b.resolve('B');
	const output = await pending;
	const visible = output.html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<script[\s\S]*?<\/script>/g, '');
	assert.equal(visible, '<ul><li data-id="b">B</li><li data-id="a">A</li></ul>');
	const repeated = await rt.prerender(Root);
	assert.equal(repeated.html, output.html, 'request-local replay metadata does not leak');
	const calls = { a: 0, b: 0 };
	let pass = 0;
	function Fresh(p) {
		return h('li', { 'data-id': p.id }, rt.use(Promise.resolve(p.id + ':' + calls[p.id]++)));
	}
	function Moving() {
		const keys = pass++ % 2 === 0 ? ['a', 'b'] : ['b', 'a'];
		return h(
			'ul',
			null,
			keys.map((id) => h(Fresh, { id, key: id })),
		);
	}
	const moved = await rt.prerender(Moving);
	const values = [...moved.html.matchAll(/<li data-id="([ab])">([^<]+)<\/li>/g)]
		.map((match) => [match[1], match[2]])
		.sort();
	assert.deepEqual(
		values,
		[
			['a', 'a:0'],
			['b', 'b:0'],
		],
		'keyed async identities retain their first settled value when every retry reorders',
	);
	return { visible, css: output.css, values };
}
try {
	const clean = await bundle('clean');
	const observed = await bundle('observed');
	const scan = await bundle('lower-scan');
	const cached = await bundle('host-cache');
	const expectedControls = control(clean.rt);
	const asyncControls = await asyncControl(clean.rt);
	globalThis.__metadataWork = Object.fromEntries(counters.map((name) => [name, 0]));
	assert.deepEqual(control(observed.rt), expectedControls);
	assert.deepEqual(await asyncControl(observed.rt), asyncControls);
	assert.deepEqual(control(scan.rt), expectedControls);
	assert.deepEqual(await asyncControl(scan.rt), asyncControls);
	assert.deepEqual(control(cached.rt), expectedControls);
	assert.deepEqual(await asyncControl(cached.rt), asyncControls);
	const rejectedControls = {};
	for (const kind of [
		'shared-hook-position',
		'skip-element-guards',
		'skip-constructor-guard',
		'skip-species-guard',
		'skip-children-mark',
		'unscoped-child-segments',
	]) {
		const variant = await bundle(kind);
		let failure;
		try {
			control(variant.rt);
			await asyncControl(variant.rt);
		} catch (error) {
			failure = error.message;
		}
		assert.ok(failure, kind + ' must violate a consumer control');
		rejectedControls[kind] = failure.split('\n')[0];
	}
	const targets = [];
	for (const name of [
		'hooks',
		'mapped',
		'keyed',
		'descriptors',
		'nested-descriptors',
		'children',
		'attributes',
		'spread-attributes',
		'hosts',
		'unique-hosts',
	]) {
		const expected = workload(clean.rt, name);
		globalThis.__metadataWork = Object.fromEntries(counters.map((name) => [name, 0]));
		assert.deepEqual(workload(observed.rt, name), expected);
		assert.deepEqual(workload(scan.rt, name), expected);
		assert.deepEqual(workload(cached.rt, name), expected);
		assert.equal(
			(
				expected.html.match(
					name === 'attributes' || name === 'spread-attributes' || name === 'hosts'
						? /<input/g
						: name === 'children'
							? /<b>/g
							: name === 'unique-hosts'
								? /<x-row-/g
								: /<li /g,
				) || []
			).length,
			count,
		);
		const counts = { ...globalThis.__metadataWork };
		targets.push({
			name,
			ops: Object.fromEntries(counters.map((key) => [key, stat(counts[key])])),
			meta: { rows: count, outputHash: hash(JSON.stringify(expected)) },
		});
	}
	targets.push(
		{ name: 'row-budget', ops: Object.fromEntries(counters.map((key) => [key, stat(count)])) },
		{ name: 'render-budget', ops: Object.fromEntries(counters.map((key) => [key, stat(1)])) },
	);
	const timings = {};
	if (process.env.METADATA_TIMING === '1') {
		for (const name of ['attributes', 'descriptors', 'hosts', 'unique-hosts']) {
			for (let i = 0; i < 30; i++) {
				workload(clean.rt, name);
				workload(scan.rt, name);
				workload(cached.rt, name);
			}
			const samples = { clean: [], scan: [], cached: [] };
			for (let i = 0; i < 31; i++)
				for (const variant of i % 2 === 0
					? ['clean', 'scan', 'cached']
					: ['cached', 'scan', 'clean']) {
					const rt = variant === 'clean' ? clean.rt : variant === 'scan' ? scan.rt : cached.rt;
					const start = performance.now();
					for (let j = 0; j < 8; j++) {
						const result = workload(rt, name);
						Buffer.byteLength(result.html);
					}
					samples[variant].push((performance.now() - start) / 8);
				}
			timings[name] = Object.fromEntries(
				Object.entries(samples).map(([key, values]) => [
					key,
					{
						median: [...values].sort((a, b) => a - b)[15],
						min: Math.min(...values),
						max: Math.max(...values),
						samples: values,
					},
				]),
			);
		}
	}
	const payload = {
		suite: 'ssr-final-metadata',
		iterations: 1,
		targets,
		meta: {
			node: process.version,
			v8: process.versions.v8,
			platform: process.platform,
			arch: process.arch,
			source: hash(original),
			controls: hash(JSON.stringify(expectedControls)),
			rejectedControls,
			asyncControls,
			bundle: { bytes: clean.bytes, gzip: clean.gzip, sha256: clean.sha256 },
			lowerScanBundle: { bytes: scan.bytes, gzip: scan.gzip, sha256: scan.sha256 },
			hostCacheBundle: { bytes: cached.bytes, gzip: cached.gzip, sha256: cached.sha256 },
			timings,
		},
	};
	console.log(JSON.stringify(payload, null, 2));
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
} finally {
	fs.rmSync(temp, { recursive: true, force: true });
}
