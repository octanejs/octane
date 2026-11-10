import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { runCodemod } from '../dist/index.js';
import { bundleRuntime, installDOM } from './bundle-runtime.js';

const temporary = [];
const asset =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="none"><path d="M0 0L6 4Z" fill="currentColor" fill-rule="evenodd"/><path d="M1 1L3 3" stroke="#fff" stroke-width="0.5"/></svg>';
const pane = `import Mark from '@/icons/mark.svg';
	export function Pane() { return <button><Mark className="status" aria-hidden /></button>; }`;

afterEach(() => {
	for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function fixture(source = pane) {
	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'octane-path-svg-')));
	temporary.push(root);
	fs.symlinkSync(
		path.resolve(import.meta.dirname, '../node_modules'),
		path.join(root, 'node_modules'),
		'dir',
	);
	fs.mkdirSync(path.join(root, 'src/icons'), { recursive: true });
	fs.writeFileSync(
		path.join(root, 'package.json'),
		'{"type":"module","dependencies":{"octane":"^0.16.7"}}',
	);
	fs.writeFileSync(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				jsx: 'react-jsx',
				module: 'ESNext',
				moduleResolution: 'bundler',
				paths: { '@/*': ['./src/*'] },
			},
		}),
	);
	const file = path.join(root, 'src/pane.tsx');
	const icon = path.join(root, 'src/icons/mark.svg');
	fs.writeFileSync(file, source);
	fs.writeFileSync(icon, asset);
	return { root, file, icon };
}

function shape(element) {
	return [
		element.namespaceURI,
		element.localName,
		Object.fromEntries(Array.from(element.attributes, (a) => [a.name, a.value])),
		Array.from(element.children, shape),
	];
}

it('previews and writes explicitly selected SVG assets without migrating their consumers', async () => {
	const { root, file, icon } = fixture();
	const twin = path.join(root, 'src/icons/twin.svg');
	const unselected = path.join(root, 'src/icons/unused.svg');
	fs.copyFileSync(icon, twin);
	fs.copyFileSync(icon, unselected);
	const outputs = [
		'src/icons/mark.svg.octane.ts',
		'src/icons/twin.svg.octane.ts',
		'src/octane-path-svg.ts',
	];
	const bin = path.resolve(import.meta.dirname, '../dist/bin.js');
	const preview = spawnSync(
		process.execPath,
		[bin, '--svg-paths', '--dry-run', '--json', icon, twin],
		{ cwd: root, encoding: 'utf8' },
	);
	expect(preview.status, preview.stderr).toBe(0);
	expect(
		JSON.parse(preview.stdout)
			.files.filter((f) => f.changed)
			.map((f) => f.output)
			.sort(),
	).toEqual(outputs);
	expect(outputs.some((name) => fs.existsSync(path.join(root, name)))).toBe(false);

	const options = { root, svgPaths: true, write: true };
	await runCodemod([icon, twin], options);
	const written = outputs.map((name) => fs.readFileSync(path.join(root, name), 'utf8'));
	expect((await runCodemod([icon, twin], options)).files.some((f) => f.changed)).toBe(false);
	expect(outputs.map((name) => fs.readFileSync(path.join(root, name), 'utf8'))).toEqual(written);
	expect(fs.readFileSync(file, 'utf8')).toBe(pane);
	for (const source of [icon, twin, unselected])
		expect(fs.readFileSync(source, 'utf8')).toBe(asset);
	expect(fs.existsSync(unselected + '.octane.ts')).toBe(false);
	expect(fs.existsSync(path.join(root, 'src/pane.tsrx'))).toBe(false);
});

it.each(['unsupported SVG', 'existing sidecar', 'existing shared helper'])(
	'preflights all explicitly selected SVG assets before writing when there is an %s',
	async (reason) => {
		const { root, file, icon } = fixture();
		const second = path.join(root, 'src/icons/other.svg');
		fs.writeFileSync(
			second,
			reason === 'unsupported SVG' ? '<svg><text>caption</text></svg>' : asset,
		);
		const helper = path.join(root, 'src/octane-path-svg.ts');
		const collision =
			reason === 'existing sidecar'
				? second + '.octane.ts'
				: reason === 'existing shared helper'
					? helper
					: null;
		if (collision) fs.writeFileSync(collision, 'export const appOwned = 1;');
		const { files } = await runCodemod([icon, second], { root, svgPaths: true, write: true });
		expect(
			files
				.flatMap((f) => [...f.notes, ...f.diagnostics])
				.some((finding) => finding.severity === 'error'),
		).toBe(true);
		expect(fs.existsSync(icon + '.octane.ts')).toBe(false);
		for (const output of [helper, second + '.octane.ts']) {
			if (output === collision)
				expect(fs.readFileSync(output, 'utf8')).toBe('export const appOwned = 1;');
			else expect(fs.existsSync(output)).toBe(false);
		}
		expect(fs.readFileSync(file, 'utf8')).toBe(pane);
	},
);

it('preserves the authored SVG root on the server and the client, including subsequent asset edits', async () => {
	const { root, file, icon } = fixture();
	const options = { root, svgPaths: true, strong: true, verify: true, write: false };
	const unchanged = await runCodemod([file], { ...options, svgPaths: false });
	expect(unchanged.files.some((f) => f.rules['svg-paths'])).toBe(false);
	const preview = await runCodemod([file], options);
	expect(preview.files.find((f) => f.file === 'src/pane.tsx').rules['svg-paths']).toBe(1);
	expect(fs.readFileSync(file, 'utf8')).toBe(pane);
	expect(fs.existsSync(path.join(root, 'src/octane-path-svg.ts'))).toBe(false);
	expect(fs.existsSync(icon + '.octane.ts')).toBe(false);
	const result = await runCodemod([file], { ...options, write: true });
	const migrated = result.files.find((f) => f.file === 'src/pane.tsx');
	expect(migrated.strong).toBe(true);
	expect(
		[...migrated.notes, ...migrated.diagnostics].filter((n) => n.severity === 'error'),
	).toEqual([]);
	const helper = path.join(root, 'src/octane-path-svg.ts');
	const first = fs.readFileSync(helper, 'utf8');
	const adapter = fs.readFileSync(icon + '.octane.ts', 'utf8');
	const next = path.join(root, 'src/next.tsx');
	fs.writeFileSync(next, pane.replace('@/icons/mark.svg', './icons/mark.svg'));
	await runCodemod([next], { ...options, write: true });
	expect(fs.readFileSync(helper, 'utf8')).toBe(first);
	expect(fs.readFileSync(icon + '.octane.ts', 'utf8')).toBe(adapter);
	const rerun = await runCodemod([root], { ...options, write: true });
	expect(rerun.files.filter((f) => f.changed)).toEqual([]);

	const load = (mode, runtime) =>
		bundleRuntime(root, mode, "export { Pane } from './src/pane.tsrx';" + runtime, [], {
			'.svg': 'text',
		});
	const dom = installDOM();
	try {
		const server = await load('server', "export {prerender} from 'octane/static';");
		const rendered = document.createElement('template');
		rendered.innerHTML = (await server.prerender(server.Pane, {})).html;
		const expected = document.createElement('template');
		const reactIcon = createElement(
			'svg',
			{
				xmlns: 'http://www.w3.org/2000/svg',
				viewBox: '0 0 12 12',
				fill: 'none',
				className: 'status',
				'aria-hidden': true,
			},
			createElement('path', { d: 'M0 0L6 4Z', fill: 'currentColor', fillRule: 'evenodd' }),
			createElement('path', { d: 'M1 1L3 3', stroke: '#fff', strokeWidth: '0.5' }),
		);
		expected.innerHTML = renderToStaticMarkup(reactIcon);
		const reference = expected.content.firstElementChild;
		expect(shape(rendered.content.querySelector('button > svg'))).toEqual(shape(reference));
		fs.writeFileSync(icon, asset.replace('0 0 12 12', '0 0 24 24').replace('M1 1L3 3', 'M2 2L7 7'));
		const client = await load('client', "export {createRoot} from 'octane';");
		const container = document.createElement('div');
		const mounted = client.createRoot(container);
		try {
			mounted.render(client.Pane, {});
			reference.setAttribute('viewBox', '0 0 24 24');
			reference.lastElementChild.setAttribute('d', 'M2 2L7 7');
			expect(shape(container.querySelector('button > svg'))).toEqual(shape(reference));
		} finally {
			mounted.unmount();
		}
	} finally {
		dom.window.close();
		vi.unstubAllGlobals();
	}
}, 30_000);

it('keeps distinct component types for separate SVG modules with identical source', async () => {
	const { root, file, icon } = fixture(`
		import First from './icons/mark.svg';
		import Twin from './icons/twin.svg';
		export function Pane() { return <div><First/><Twin/></div>; }`);
	fs.copyFileSync(icon, path.join(root, 'src/icons/twin.svg'));
	await runCodemod([file], { root, svgPaths: true, strong: true, verify: true, write: true });
	const dom = installDOM();
	try {
		const runtime = await bundleRuntime(
			root,
			'client',
			`
			export {createRoot} from 'octane';
			export {default as First} from './src/icons/mark.svg.octane.ts';
			export {default as Twin} from './src/icons/twin.svg.octane.ts';`,
			[],
			{ '.svg': 'text' },
		);
		expect(runtime.Twin).not.toBe(runtime.First);
		const container = document.createElement('div');
		const mounted = runtime.createRoot(container);
		try {
			mounted.render(runtime.First, {});
			const original = container.querySelector('svg');
			expect(original).not.toBeNull();
			mounted.render(runtime.First, { className: 'updated' });
			expect(container.firstElementChild).toBe(original);
			mounted.render(runtime.Twin, {});
			expect(container.firstElementChild).not.toBe(original);
			expect(container.firstElementChild.localName).toBe('svg');
		} finally {
			mounted.unmount();
		}
	} finally {
		dom.window.close();
		vi.unstubAllGlobals();
	}
});

it('matches React class coercion for values passed to a directly returned icon', async () => {
	const { root, file } = fixture(`import Mark from './icons/mark.svg';
		export function Pane({className}) { return <Mark className={className}/>; }`);
	const result = await runCodemod([file], {
		root,
		svgPaths: true,
		strong: true,
		verify: true,
		write: true,
	});
	expect(result.files.find((f) => f.file === 'src/pane.tsx').rules['svg-paths']).toBe(1);
	const load = (mode, entry) =>
		bundleRuntime(root, mode, "export {Pane} from './src/pane.tsrx';" + entry, [], {
			'.svg': 'text',
		});
	const dom = installDOM();
	try {
		const server = await load('server', "export {prerender} from 'octane/static';");
		const client = await load('client', "export {act, createRoot} from 'octane';");
		const { createRoot: reactRoot } = await import('react-dom/client');
		const { act } = await import('react');
		const original = document.createElement('div');
		const migrated = document.createElement('div');
		const a = reactRoot(original);
		const b = client.createRoot(migrated);
		try {
			for (const value of [
				'status',
				'',
				undefined,
				['one', 'two'],
				{ selected: true },
				null,
				0,
				7n,
				true,
				false,
				Symbol('status'),
				() => 'status',
				{ [Symbol.toPrimitive]: (hint) => hint },
			]) {
				const reactIcon = createElement('svg', { className: value });
				await act(async () => a.render(reactIcon));
				await client.act(async () => b.render(client.Pane, { className: value }));
				expect(migrated.firstElementChild.getAttribute('class')).toBe(
					original.firstElementChild.getAttribute('class'),
				);
				const expected = document.createElement('template');
				expected.innerHTML = renderToStaticMarkup(reactIcon);
				const actual = document.createElement('template');
				actual.innerHTML = (await server.prerender(server.Pane, { className: value })).html;
				expect(actual.content.querySelector('svg').getAttribute('class')).toBe(
					expected.content.querySelector('svg').getAttribute('class'),
				);
			}
		} finally {
			await act(async () => a.unmount());
			await client.act(async () => b.unmount());
		}
	} finally {
		dom.window.close();
		vi.unstubAllGlobals();
	}
});

it.each([
	['a call argument', 'import {send} from "consumer";', 'send(<Mark/>); return <button/>;'],
	[
		'a React island',
		'import {ReactCompat} from "octane/react"; import {View} from "consumer";',
		'return <ReactCompat><View icon={<Mark/>}/></ReactCompat>;',
	],
	['a component prop', 'import {View} from "consumer";', 'return <View icon={<Mark/>}/>;'],
	['a component child', 'import {View} from "consumer";', 'return <View><Mark/></View>;'],
	['a custom JSX runtime', '/** @jsxImportSource other-renderer */', 'return <Mark/>;'],
])('keeps the original SVG when used in %s', async (_label, imports, body) => {
	const { root, file, icon } = fixture(
		imports + "\nimport Mark from './icons/mark.svg';\nexport function Pane() {" + body + '}',
	);
	const { files } = await runCodemod([file], { root, svgPaths: true, write: false });
	expect(files.find((f) => f.file === 'src/pane.tsx').rules['svg-paths']).toBeUndefined();
	expect(files.some((f) => f.file.endsWith('.svg.octane.ts'))).toBe(false);
	expect(fs.existsSync(icon + '.octane.ts')).toBe(false);
});

it('keeps the SVG import when a locally consumed component can render it elsewhere', async () => {
	const { root, file } = fixture(`import Mark from './icons/mark.svg';
		import { consume } from 'foreign-renderer';
		export function Paint() { return <Mark/>; }
		function Outer() { return <Paint/>; }
		consume(Outer);`);
	const { files } = await runCodemod([file], { root, svgPaths: true, write: false });
	expect(files.find((f) => f.file === 'src/pane.tsx').rules['svg-paths']).toBeUndefined();
	expect(files.some((f) => f.file.endsWith('.svg.octane.ts'))).toBe(false);
});

it.each(['unowned helper', 'unowned sidecar', 'mixed uses', 'unsupported asset'])(
	'retains the original import for %s',
	async (reason) => {
		const { root, file, icon } = fixture(
			reason === 'mixed uses' ? pane + '\nexport const Copy = Mark;' : pane,
		);
		const helper = path.join(root, 'src/octane-path-svg.ts');
		if (reason === 'unowned helper') fs.writeFileSync(helper, 'export const custom = true;');
		if (reason === 'unowned sidecar')
			fs.writeFileSync(icon + '.octane.ts', 'export const custom = true;');
		if (reason === 'unsupported asset') fs.writeFileSync(icon, '<svg><title>Badge</title></svg>');
		const result = await runCodemod([file], {
			root,
			svgPaths: true,
			strong: true,
			verify: true,
			write: true,
		});
		const converted = result.files.find((f) => f.file === 'src/pane.tsx');
		expect(converted.rules['svg-paths']).toBeUndefined();
		expect(converted.code).toContain('@/icons/mark.svg');
		expect(converted.code).not.toContain('.svg?raw');
		if (reason === 'unowned helper')
			expect(fs.readFileSync(helper, 'utf8')).toBe('export const custom = true;');
		else expect(fs.existsSync(helper)).toBe(false);
		if (reason === 'unowned sidecar')
			expect(fs.readFileSync(icon + '.octane.ts', 'utf8')).toBe('export const custom = true;');
		else expect(fs.existsSync(icon + '.octane.ts')).toBe(false);
	},
);
