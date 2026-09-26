import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { analyze, automaticStaticShell } from './plugin.mjs';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')).href);
const { octane } = await import(pathToFileURL(require.resolve('octane/compiler/vite')).href);
const file = path.join(here, 'Shell.tsrx');
const source = fs.readFileSync(file, 'utf8');

test('accepts only the fixed static host with one directly imported child', () => {
	assert.equal(analyze(source, file)?.child, 'LiveCounter');
	assert.equal(analyze(source, file)?.rootTag, 'main');
	const divRoot = source
		.replace('<main data-shell>', '<div data-shell>')
		.replace('</main>', '</div>');
	assert.equal(analyze(divRoot, file)?.rootTag, 'div');
	const rootHost = `import { LiveCounter } from './LiveCounter.tsrx';
export function Shell() @{ <div><LiveCounter /></div> }`;
	assert.equal(analyze(rootHost, file), null);
	const negative = [
		source.replace('<main data-shell>', '<section data-shell>').replace('</main>', '</section>'),
		divRoot.replace('<div data-shell>', '<div data-shell onClick={() => {}}>'),
		source.replace(
			'export function Shell() @{',
			'export function Shell() @{ globalThis.changed = true;',
		),
		source.replace('<main data-shell>', '<main data-shell onClick={() => {}}>'),
		source.replace('<main data-shell>', '<main data-shell ref={value}>'),
		source.replace('<main data-shell>', '<main {...value}>'),
		source.replace('<main data-shell>', '<main dangerouslySetInnerHTML="unexpected">'),
		source.replace('<main data-shell>', '<main tabIndex="-1" autoFocus>'),
		source.replace('<main data-shell>', '<main innerText="unexpected">'),
		source.replace('<main data-shell>', '<main textContent="unexpected">'),
		source.replace('<main data-shell>', '<main children="unexpected">'),
		source.replace('Content retained from the server', '{value}'),
		source.replace('<LiveCounter />', '<LiveCounter value={1} />'),
		source.replace('<LiveCounter />', '<LiveCounter /><LiveCounter />'),
		source.replace('<LiveCounter />', '@if (true) { <LiveCounter /> }'),
		source
			.replace('<div>\n\t\t\t\t<LiveCounter />', '<span>\n\t\t\t\t<LiveCounter />')
			.replace('</div>', '</span>'),
		source.replace('function Shell()', 'function Shell(props)'),
		source + '\nexport const extra = 1;\n',
		source.replace('import { LiveCounter }', 'import * as LiveCounter'),
		source.replace('import { LiveCounter }', "import { 'odd-name' as LiveCounter }"),
		source.replace('function Shell()', 'function Error()'),
		source.replace('<p data-shell-summary>', '<p data-shell-summary><div>bad</div>'),
	];
	for (const candidate of negative) assert.equal(analyze(candidate, file), null, candidate);
	assert.equal(analyze(fs.readFileSync(path.join(here, 'UnsafeShell.tsrx'), 'utf8'), file), null);
});

test('does not specialize a child when its compiled-code fingerprint is stale', async () => {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-shell-stale-proof-'));
	try {
		const decisions = [];
		const child = path.join(here, 'LiveCounter.tsrx');
		const tamper = {
			name: 'change-child-after-compile',
			enforce: 'post',
			transform(code, id) {
				if (id === child)
					return { code: code + '\n/* altered after Octane compilation */\n', map: null };
				return null;
			},
		};
		const result = await build({
			root: repo,
			configFile: false,
			publicDir: false,
			mode: 'production',
			logLevel: 'silent',
			plugins: [
				automaticStaticShell({
					root: repo,
					file,
					specialize: true,
					onDecision: (decision) => decisions.push(decision),
				}),
				octane({ hmr: false, ssr: false }),
				tamper,
			],
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			build: {
				outDir: temp,
				emptyOutDir: false,
				minify: 'esbuild',
				target: 'es2022',
				lib: { entry: path.join(here, 'client.ts'), formats: ['es'] },
			},
		});
		assert.equal(decisions.length, 1);
		assert.equal(decisions[0].accepted, false);
		assert.equal(decisions[0].reason, 'child-void-proof-unavailable');
		const outputs = (Array.isArray(result) ? result : [result]).flatMap((value) => value.output);
		assert.ok(
			outputs.some(
				(value) =>
					value.type === 'chunk' && value.code.includes('Content retained from the server'),
			),
			'the stale-proof fallback must retain the ordinary compiled shell',
		);
	} finally {
		fs.rmSync(temp, { recursive: true, force: true });
	}
});

test('does not consume a generated root proof after a later transform changes its code', async () => {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-shell-stale-root-'));
	try {
		async function compile(stale) {
			const decisions = [];
			const tamper = {
				name: 'change-shell-after-proof',
				enforce: 'post',
				transform: {
					order: 'post',
					handler(code, id) {
						if (id === file)
							return { code: code + '\n/* changed after root proof */\n', map: null };
						return null;
					},
				},
			};
			const result = await build({
				root: repo,
				configFile: false,
				publicDir: false,
				mode: 'production',
				logLevel: 'silent',
				plugins: [
					automaticStaticShell({
						root: repo,
						file,
						specialize: true,
						onDecision: (decision) => decisions.push(decision),
					}),
					octane({ hmr: false, ssr: false }),
					...(stale ? [tamper] : []),
				],
				define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
				build: {
					outDir: path.join(temp, stale ? 'stale' : 'control'),
					emptyOutDir: false,
					minify: 'esbuild',
					target: 'es2022',
					lib: { entry: path.join(here, 'client.ts'), formats: ['es'] },
				},
			});
			assert.equal(decisions[0].childVoid, true);
			assert.equal(decisions[0].rootVoid, true, 'the test must alter code after proof publication');
			const outputs = (Array.isArray(result) ? result : [result]).flatMap((value) => value.output);
			return outputs
				.filter((value) => value.type === 'chunk')
				.reduce((total, value) => total + gzipSync(value.code, { level: 9 }).length, 0);
		}
		const control = await compile(false);
		const stale = await compile(true);
		// The generic root pulls in the returned-value renderer. This broad size
		// distinction is a benchmark control for the fingerprint mechanism.
		assert.ok(stale > control + 10_000, `stale=${stale}, control=${control}`);
	} finally {
		fs.rmSync(temp, { recursive: true, force: true });
	}
});

test('keeps the normal component and its setup when analysis rejects it', async () => {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-shell-fallback-'));
	try {
		const decisions = [];
		const unsafe = path.join(here, 'UnsafeShell.tsrx');
		await build({
			root: repo,
			configFile: false,
			publicDir: false,
			mode: 'production',
			logLevel: 'silent',
			plugins: [
				automaticStaticShell({
					root: repo,
					file: unsafe,
					onDecision: (decision) => decisions.push(decision),
				}),
				octane({ hmr: false, ssr: false }),
			],
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			build: {
				outDir: temp,
				emptyOutDir: false,
				minify: 'esbuild',
				target: 'es2022',
				lib: { entry: path.join(here, 'unsafe-client.ts'), formats: ['es'] },
				rolldownOptions: {
					output: { entryFileNames: 'entry.js', chunkFileNames: '[name]-[hash].js' },
				},
			},
		});
		assert.deepEqual(
			decisions.map((decision) => decision.accepted),
			[false],
		);
		fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}\n', { flag: 'wx' });
		const driver = path.join(temp, 'driver.cjs');
		// Use the emitted ESM and a fresh process, so the actual compiled setup is
		// observed rather than inspecting a helper or generated source formatting.
		fs.writeFileSync(
			driver,
			`const { JSDOM } = require(${JSON.stringify(require.resolve('jsdom'))});\n` +
				`const { pathToFileURL } = require('node:url');\n` +
				`const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });\n` +
				`for (const name of ['window','document','Node','Element','HTMLElement','SVGElement',` +
				`'DocumentFragment','Text','Comment','Event','MouseEvent','CustomEvent','MutationObserver',` +
				`'NodeFilter','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLOptionElement',` +
				`'HTMLButtonElement','Document','navigator']) Object.defineProperty(globalThis, name, ` +
				`{ configurable: true, value: dom.window[name] });\n` +
				`import(pathToFileURL(${JSON.stringify(path.join(temp, 'entry.js'))})).then(() => {\n` +
				`  if (window.__unsafeShellRuns !== 1 || !document.querySelector('button')) process.exitCode = 1;\n` +
				`  dom.window.close();\n` +
				`}).catch((error) => { console.error(error); process.exitCode = 1; });\n`,
		);
		execFileSync(process.execPath, [driver], { encoding: 'utf8', timeout: 20_000 });
	} finally {
		fs.rmSync(temp, { recursive: true, force: true });
	}
});

test('a fresh client mount demonstrates why the surrogate needs a lifetime contract', async () => {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-shell-mount-control-'));
	try {
		async function mount(candidate) {
			const directory = path.join(temp, candidate ? 'candidate' : 'baseline');
			const decisions = [];
			const entry = path.join(here, '__experimental_mount_control.ts');
			assert.ok(!fs.existsSync(entry));
			const virtual = {
				name: 'experimental-shell-mount-entry',
				resolveId(id) {
					if (id === entry) return entry;
				},
				load(id) {
					if (id === entry)
						return `import { createRoot } from 'octane';\nimport { Shell } from ${JSON.stringify(file)};\ncreateRoot(document.getElementById('root')).render(Shell, {});`;
				},
			};
			await build({
				root: repo,
				configFile: false,
				publicDir: false,
				mode: 'production',
				logLevel: 'silent',
				plugins: [
					virtual,
					...(candidate
						? automaticStaticShell({
								root: repo,
								file,
								specialize: true,
								onDecision: (decision) => decisions.push(decision),
							})
						: []),
					octane({ hmr: false, ssr: false }),
				],
				define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
				build: {
					outDir: directory,
					emptyOutDir: false,
					minify: 'esbuild',
					target: 'es2022',
					lib: { entry, formats: ['es'] },
					rolldownOptions: {
						output: { entryFileNames: 'entry.js', chunkFileNames: '[name]-[hash].js' },
					},
				},
			});
			if (candidate) assert.equal(decisions[0].accepted, true);
			fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}\n');
			const driver = path.join(directory, 'driver.cjs');
			fs.writeFileSync(
				driver,
				`const { JSDOM } = require(${JSON.stringify(require.resolve('jsdom'))});\n` +
					`const { pathToFileURL } = require('node:url');\n` +
					`const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });\n` +
					`for (const name of ['window','document','Node','Element','HTMLElement','SVGElement',` +
					`'DocumentFragment','Text','Comment','Event','MouseEvent','CustomEvent','MutationObserver',` +
					`'NodeFilter','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLOptionElement',` +
					`'HTMLButtonElement','Document','navigator']) Object.defineProperty(globalThis, name, ` +
					`{ configurable: true, value: dom.window[name] });\n` +
					`const errors=[]; console.error=(...args)=>errors.push(args.map(String).join(' '));\n` +
					`import(pathToFileURL(${JSON.stringify(path.join(directory, 'entry.js'))})).catch(e=>errors.push(String(e))).then(() => {\n` +
					`  console.log(JSON.stringify({ mounted: !!document.querySelector('[data-shell]'), errors }));\n` +
					`  dom.window.close();\n` +
					`});\n`,
			);
			return JSON.parse(
				execFileSync(process.execPath, [driver], { encoding: 'utf8', timeout: 20_000 })
					.trim()
					.split('\n')
					.at(-1),
			);
		}
		const baseline = await mount(false);
		const candidate = await mount(true);
		assert.equal(baseline.mounted, true);
		assert.deepEqual(baseline.errors, []);
		assert.equal(candidate.mounted, false);
		assert.ok(candidate.errors.some((error) => error.includes('Static shell prototype')));
	} finally {
		fs.rmSync(temp, { recursive: true, force: true });
	}
});

test('never transforms server requests or other files', async () => {
	const [plugin] = automaticStaticShell({ root: repo, file });
	assert.equal(await plugin.transform.handler(source, file, { ssr: true }), null);
	assert.equal(await plugin.transform.handler(source, file + '?raw', {}), null);
	plugin.configResolved({
		root: repo,
		mode: 'production',
		isProduction: true,
		build: { watch: {} },
	});
	assert.equal(await plugin.transform.handler(source, file, {}), null);
	plugin.configResolved({
		root: repo,
		mode: 'production',
		isProduction: false,
		build: { watch: null },
	});
	assert.equal(await plugin.transform.handler(source, file, {}), null);
	plugin.configResolved({
		root: repo,
		mode: 'development',
		isProduction: true,
		build: { watch: null },
	});
	assert.equal(await plugin.transform.handler(source, file, {}), null);
	plugin.configResolved({
		root: repo,
		mode: 'production',
		isProduction: true,
		build: { watch: null },
	});
	assert.equal(
		await plugin.transform.handler.call(
			{ environment: { config: { consumer: 'server' } } },
			source,
			file,
			{},
		),
		null,
	);
});
