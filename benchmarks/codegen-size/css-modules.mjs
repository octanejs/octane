// Fixed, public CSS-module codegen sentinel. Both variants compile the same
// component and immutable provider; only the host's class-string proof changes.
// The measured JS contains the component and provider, not the framework. A
// real stylesheet is emitted in both variants and checked separately, while a
// full server bundle supplies the semantic control.
import { compile } from 'octane/compiler';
import { build, version as esbuildVersion } from 'esbuild';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zc, gzipSync } from 'node:zlib';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const COMPONENT = './css-modules.tsrx';
const FILENAME = path.join(DIR, 'css-modules.tsrx');
const MODULE = './css-modules.module.css';
const STYLESHEET = './css-modules.styles.css';
const CLASSES = Object.freeze({
	root: '_css_root_a1b2',
	header: '_css_header_b2c3',
	mark: '_css_mark_c3d4',
	icon: '_css_icon_d4e5',
	heading: '_css_heading_e5f6',
	caption: '_css_caption_f6a7',
	content: '_css_content_a7b8',
	nav: '_css_nav_b8c9',
	link: '_css_link_c9d0',
	list: '_css_list_d0e1',
	row: '_css_row_e1f2',
	label: '_css_label_f2a3',
	meta: '_css_meta_a3b4',
	empty: '_css_empty_b4c5',
	footer: '_css_footer_c5d6',
	action: '_css_action_d6e7',
	note: '_css_note_e7f8',
});

const SOURCE = `import styles, { label } from './css-modules.module.css';
import * as classes from './css-modules.module.css';

interface Props {
	title: string;
	detail: string;
	active: boolean;
	rows: { id: string; label: string; detail: string }[];
}

export function CssModules(props: Props) @{
	<section class={styles.root} data-active={props.active ? 'yes' : 'no'}>
		<header class={styles.header}>
			<div className={styles.mark}><span class={classes.icon}>*</span></div>
			<h1 class={styles.heading}>{props.title as string}</h1>
			<p class={styles.caption + ' muted'}>{props.detail as string}</p>
		</header>
		<div class={styles.content}>
			<nav class={styles.nav}>
				<a class={styles.link + ' active'} href="#overview">Overview</a>
				<a class={styles.link} href="#details">Details</a>
			</nav>
			<ul class={styles.list}>
				@for (const row of props.rows; key row.id) {
					<li class={styles.row} data-id={row.id}>
						<span class={label}>{row.label as string}</span>
						<small class={styles.meta}>{row.detail as string}</small>
					</li>
				} @empty {
					<li class={styles.empty}>No items</li>
				}
			</ul>
		</div>
		<footer class={styles.footer}>
			<button class={styles.action} type="button">Continue</button>
			<p class={styles.note}>Changes are saved.</p>
		</footer>
	</section>
}`;

// Object.freeze supplies the default-map immutability contract. The pure
// annotation permits the unused allocation to disappear but does not erase its
// independent stylesheet import. Named exports are initialized const strings.
const PROVIDER = [
	`import ${JSON.stringify(STYLESHEET)};`,
	...Object.entries(CLASSES).map(
		([name, value]) => `export const ${name}=${JSON.stringify(value)};`,
	),
	`export default /* @__PURE__ */ Object.freeze(${JSON.stringify(CLASSES)});`,
].join('\n');
const CSS = Object.values(CLASSES)
	.map((value, index) => `.${value}{--css-module-sentinel:${index}}`)
	.join('\n');

const proof = (request, imported, property) => {
	if (request !== MODULE) return undefined;
	const name =
		imported === 'default' || imported === '*' ? property : property === null ? imported : null;
	return name !== null && Object.hasOwn(CLASSES, name) ? CLASSES[name] : undefined;
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
const val = (bytes) => ({ median: bytes, min: bytes, samples: 1 });
const bytes = (value) => Buffer.byteLength(value);
const compileFixture = (mode, resolveCssModuleConstant, preserveReferences = false) =>
	compile(SOURCE, FILENAME, {
		mode,
		hmr: false,
		dev: false,
		profile: false,
		...(resolveCssModuleConstant ? { resolveCssModuleConstant } : {}),
		...(preserveReferences ? { preserveCssModuleReferences: [MODULE] } : {}),
	}).code;

async function bundleFixture(mode, code, minify, withRuntime = false) {
	const entry = withRuntime
		? `import { renderToString } from 'octane/server';
import { CssModules } from ${JSON.stringify(COMPONENT)};
export async function render(props) { return (await renderToString(CssModules, props)).html; }`
		: `export { CssModules } from ${JSON.stringify(COMPONENT)};`;
	const result = await build({
		stdin: { contents: entry, loader: 'js', resolveDir: DIR, sourcefile: 'css-modules-entry.js' },
		outdir: path.join(DIR, '.css-modules-output'),
		bundle: true,
		write: false,
		format: 'esm',
		platform: mode === 'server' ? 'node' : 'browser',
		target: 'es2022',
		minify,
		legalComments: 'none',
		logLevel: 'silent',
		external: withRuntime ? [] : ['octane', 'octane/*'],
		define: {
			'process.env.NODE_ENV': '"production"',
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		plugins: [
			{
				name: 'css-modules-codegen-sentinel',
				setup(bundler) {
					bundler.onResolve({ filter: /^\.\/css-modules\.tsrx$/ }, () => ({
						path: FILENAME,
						namespace: 'css-component',
					}));
					bundler.onResolve({ filter: /^\.\/css-modules\.module\.css$/ }, () => ({
						path: MODULE,
						namespace: 'css-provider',
					}));
					bundler.onResolve({ filter: /^\.\/css-modules\.styles\.css$/ }, () => ({
						path: STYLESHEET,
						namespace: 'css-stylesheet',
					}));
					bundler.onLoad({ filter: /.*/, namespace: 'css-component' }, () => ({
						contents: code,
						loader: 'js',
						resolveDir: DIR,
					}));
					bundler.onLoad({ filter: /.*/, namespace: 'css-provider' }, () => ({
						contents: PROVIDER,
						loader: 'js',
						resolveDir: DIR,
					}));
					bundler.onLoad({ filter: /.*/, namespace: 'css-stylesheet' }, () => ({
						contents: CSS,
						loader: 'css',
					}));
				},
			},
		],
	});
	const javascript = result.outputFiles.filter((file) => file.path.endsWith('.js'));
	const stylesheets = result.outputFiles.filter((file) => file.path.endsWith('.css'));
	assert.equal(javascript.length, 1, 'the sentinel must emit one JavaScript bundle');
	assert.equal(stylesheets.length, 1, 'constant classes must retain their stylesheet');
	const stylesheet = stylesheets[0].text;
	for (const className of Object.values(CLASSES)) {
		assert.ok(stylesheet.includes(`.${className}`), `missing stylesheet rule ${className}`);
	}
	return { code: javascript[0].text, stylesheet };
}

const SEMANTIC_INPUTS = [
	{
		props: {
			title: 'First & <title>',
			detail: 'Details & more',
			active: true,
			rows: [
				{ id: 'a', label: 'Row <A>', detail: 'One & two' },
				{ id: 'b', label: 'Row B', detail: 'Three' },
			],
		},
		contains: ['First &amp; &lt;title&gt;', 'Row &lt;A&gt;', 'One &amp; two', 'data-active="yes"'],
	},
	{
		props: { title: 'Empty', detail: '', active: false, rows: [] },
		contains: ['No items', 'data-active="no"'],
	},
];

// Bundler adapters use the same public source and semantic controls without
// reaching through this benchmark's implementation or mutating its fixture.
export const CSS_MODULE_FIXTURE = Object.freeze({
	componentRequest: COMPONENT,
	moduleRequest: MODULE,
	stylesheetRequest: STYLESHEET,
	source: SOURCE,
	classes: CLASSES,
	providerSource: PROVIDER,
	stylesheetSource: CSS,
	semanticInputs: Object.freeze(
		SEMANTIC_INPUTS.map(({ props, contains }) =>
			Object.freeze({
				props: Object.freeze({
					...props,
					rows: Object.freeze(props.rows.map((row) => Object.freeze({ ...row }))),
				}),
				contains: Object.freeze([...contains]),
			}),
		),
	),
});

export async function measureCssModules() {
	const targets = [];
	const measured = {};
	let stylesheet;
	const serverCode = {};
	for (const mode of ['client', 'server']) {
		const control = compileFixture(mode);
		assert.equal(
			compileFixture(mode, () => undefined),
			control,
			'an absent CSS proof must leave production code unchanged',
		);
		for (const [variant, code] of [
			['control', control],
			['proven', compileFixture(mode, proof, true)],
			['ceiling', compileFixture(mode, proof)],
		]) {
			const raw = await bundleFixture(mode, code, false);
			const minified = await bundleFixture(mode, code, true);
			stylesheet ??= minified.stylesheet;
			assert.equal(minified.stylesheet, stylesheet, 'CSS bytes must be equal in every variant');
			const sizes = {
				raw: bytes(raw.code),
				minified: bytes(minified.code),
				gzip: gzipSync(minified.code, { level: zc.Z_BEST_COMPRESSION }).length,
				brotli: brotliCompressSync(minified.code, {
					params: { [zc.BROTLI_PARAM_QUALITY]: zc.BROTLI_MAX_QUALITY },
				}).length,
			};
			measured[`${mode}-${variant}`] = sizes;
			if (variant !== 'ceiling') {
				targets.push({
					name: `css-modules-${mode}-${variant}`,
					ops: Object.fromEntries(Object.entries(sizes).map(([name, value]) => [name, val(value)])),
				});
			}
			if (mode === 'server') serverCode[variant] = code;
		}
	}

	const html = {};
	for (const variant of ['control', 'proven', 'ceiling']) {
		const bundle = await bundleFixture('server', serverCode[variant], true, true);
		assert.equal(bundle.stylesheet, stylesheet, 'SSR must retain the same stylesheet');
		const module = await import(
			`data:text/javascript;base64,${Buffer.from(bundle.code).toString('base64')}`
		);
		html[variant] = [];
		for (const { props, contains } of SEMANTIC_INPUTS) {
			const rendered = await module.render(props);
			for (const expected of contains) assert.ok(rendered.includes(expected), expected);
			assert.ok(rendered.includes(`class="${CLASSES.root}"`));
			assert.ok(rendered.includes(`class="${CLASSES.caption} muted"`));
			html[variant].push(rendered);
		}
	}
	assert.deepEqual(html.proven, html.control, 'proven CSS strings must render identically');
	assert.deepEqual(html.ceiling, html.control, 'fully owned CSS strings must render identically');
	const summary = {
		toolchain: {
			nodeExecutable: process.execPath,
			node: process.version,
			zlib: process.versions.zlib,
			brotli: process.versions.brotli,
			esbuild: esbuildVersion,
			gzipLevel: zc.Z_BEST_COMPRESSION,
			brotliQuality: zc.BROTLI_MAX_QUALITY,
		},
		fixtureChecksum: hash(SOURCE),
		providerChecksum: hash(PROVIDER),
		semanticChecksum: hash(JSON.stringify(html.control)),
		stylesheetChecksum: hash(stylesheet),
		stylesheetBytes: bytes(stylesheet),
		modes: measured,
	};
	for (const target of targets) {
		target.meta = {
			toolchain: summary.toolchain,
			fixtureChecksum: summary.fixtureChecksum,
			providerChecksum: summary.providerChecksum,
			semanticChecksum: summary.semanticChecksum,
			stylesheetChecksum: summary.stylesheetChecksum,
			stylesheetBytes: summary.stylesheetBytes,
		};
	}
	return { targets, summary };
}
