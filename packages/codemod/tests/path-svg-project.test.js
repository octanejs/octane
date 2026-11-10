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

const action = `export function Action({children, onClick}) {
	return <button type="button" onClick={onClick}>{children}</button>;
}`;

it.each(['./action', '@/action'])(
	'traces an SVG child through a selected receiver imported from %s',
	async (specifier) => {
		const { root, file } = fixture(`import Mark from './icons/mark.svg';
			import {Action as Control} from '${specifier}';
			export function Pane() { return <Control><Mark/></Control>; }`);
		const receiver = path.join(root, 'src/action.tsx');
		fs.writeFileSync(receiver, action);
		const options = { root, svgPaths: true, write: false };
		const alone = await runCodemod([file], options);
		expect(alone.files.find((f) => f.file === 'src/pane.tsx').rules['svg-paths']).toBeUndefined();
		const together = await runCodemod([file, receiver], options);
		expect(together.files.find((f) => f.file === 'src/pane.tsx').rules['svg-paths']).toBe(1);
	},
);

it('renders an SVG passed through selected local slots as a direct button child on the server and client', async () => {
	const { root, file } = fixture(`import Mark from './icons/mark.svg';
		type Content = {type: unknown} | string | null;
		function Frame({children}: {children: Content}) { return <section>{children! satisfies Content}</section>; }
		${action}
		function Row({icon, onClick}) { return <Action onClick={onClick}>{icon as Content}</Action>; }
		function Item({className, onClick}) { return <Row icon={<Mark className={className}/>} onClick={onClick}/>; }
		export function Pane({className, onClick}) { return <Frame><Item className={className} onClick={onClick}/></Frame>; }`);
	const { files } = await runCodemod([file], { root, svgPaths: true, verify: true, write: true });
	const migrated = files.find((f) => f.file === 'src/pane.tsx');
	expect(migrated.rules['svg-paths']).toBe(1);
	expect(
		[...migrated.notes, ...migrated.diagnostics].filter((n) => n.severity === 'error'),
	).toEqual([]);
	const load = (mode, entry) =>
		bundleRuntime(root, mode, "export {Pane} from './src/pane.tsrx';" + entry, [], {
			'.svg': 'text',
		});
	const dom = installDOM();
	try {
		const server = await load('server', "export {renderToString} from 'octane/server';");
		const container = document.createElement('div');
		const onClick = vi.fn();
		const props = { className: 'initial', onClick };
		container.innerHTML = server.renderToString(server.Pane, props).html;
		const icon = container.querySelector('section > button > svg');
		expect(icon?.getAttribute('class')).toBe('initial');
		const firstPath = icon.firstElementChild;
		expect(firstPath?.getAttribute('d')).toBe('M0 0L6 4Z');
		const client = await load('client', "export {act, hydrateRoot} from 'octane';");
		const mounted = client.hydrateRoot(container, client.Pane, props);
		try {
			expect(container.querySelector('button > svg')).toBe(icon);
			expect(icon.firstElementChild).toBe(firstPath);
			container.querySelector('button').click();
			expect(onClick).toHaveBeenCalledTimes(1);
			await client.act(async () => mounted.render(client.Pane, { className: 'next', onClick }));
			expect(container.querySelector('button > svg')).toBe(icon);
			expect(icon.firstElementChild).toBe(firstPath);
			expect(icon.getAttribute('class')).toBe('next');
		} finally {
			mounted.unmount();
		}
	} finally {
		dom.window.close();
		vi.unstubAllGlobals();
	}
});

it.each([
	[
		'a shadowing caller parameter',
		action,
		'export function Pane({Action}) { return <Action><Mark/></Action>; }',
	],
	[
		'an opaque alias',
		action + ' const Other = Action;',
		'export function Pane() { return <Other><Mark/></Other>; }',
	],
	[
		'an owner passed to a call',
		action,
		'function Inner() { return <Action><Mark/></Action>; } consume(Inner);',
	],
	[
		'a receiver parameter escape',
		'function Action(props) { capture(props); return <button>{props.children}</button>; }',
		'export function Pane() { return <Action><Mark/></Action>; }',
	],
	[
		'a receiver that invokes an unverified renderer hook',
		'import { useExternal as read } from "external-react"; function Action({children}) { const id = read(); return <button id={id}>{children}</button>; }',
		'export function Pane() { return <Action><Mark/></Action>; }',
	],
	[
		'a hook called through a local alias',
		'import * as hooks from "external-react"; const read = hooks["useExternal"]; function Action({children}) { (read)(); return <button>{children}</button>; }',
		'export function Pane() { return <Action><Mark/></Action>; }',
	],
	[
		'an escaped arguments object despite destructuring',
		'function Action({children}) { capture(arguments[0]); return <button>{children}</button>; }',
		'export function Pane() { return <Action><Mark/></Action>; }',
	],
	[
		'a cloned child',
		'function Action({children}) { return <button>{clone(children)}</button>; }',
		'export function Pane() { return <Action><Mark/></Action>; }',
	],
	[
		'a polymorphic render callback',
		'function Action({children, renderLink}) { if (renderLink) return renderLink(children); return <button>{children}</button>; }',
		'export function Pane({renderLink}) { return <Action renderLink={renderLink}><Mark/></Action>; }',
	],
	[
		'a React island inside the receiver',
		'import {ReactCompat} from "octane/react"; import {Foreign} from "foreign"; function Action({children}) { return <ReactCompat><Foreign>{children}</Foreign></ReactCompat>; }',
		'export function Pane() { return <Action><Mark/></Action>; }',
	],
	[
		'a cycle in the selected children slots',
		'function Action({children}) { return <Frame slot={children}/>; } function Frame({slot}) { return <Action>{slot}</Action>; }',
		'export function Pane() { return <Action><Mark/></Action>; }',
	],
	[
		'an explicit children prop overridden by the JSX body',
		action,
		'export function Pane() { return <Action children={<Mark/>}><span>visible</span></Action>; }',
	],
	[
		'an async receiver',
		'async function Action({children}) { return <button>{children}</button>; }',
		'export function Pane() { return <Action><Mark/></Action>; }',
	],
	[
		'a generator receiver',
		'function* Action({children}) { return <button>{children}</button>; }',
		'export function Pane() { return <Action><Mark/></Action>; }',
	],
	[
		'a raw text host',
		'function Action({children}) { return <textarea>{children}</textarea>; }',
		'export function Pane() { return <Action><Mark/></Action>; }',
	],
	[
		'a nested foreign slot',
		'import {External} from "foreign"; function Action({children}) { return <Frame icon={children}/>; } function Frame({icon}) { return <External>{icon}</External>; }',
		'export function Pane() { return <Action><Mark/></Action>; }',
	],
	[
		'a nested slot that also sends its value to a callback',
		'function Action({children}) { return <Frame icon={children}/>; } function Frame({icon}) { inspect(icon); return <button>{icon}</button>; }',
		'export function Pane() { return <Action><Mark/></Action>; }',
	],
	[
		'an unchecked sibling prop',
		'function Action({icon, other}) { inspect(other); return <button>{icon}</button>; }',
		'export function Pane() { return <Action other={<Mark/>}/>; }',
	],
])(
	'retains the original asset when a selected receiver has %s',
	async (_case, declaration, usage) => {
		const { root, file } = fixture(
			"import Mark from './icons/mark.svg';\n" + declaration + '\n' + usage,
		);
		const { files } = await runCodemod([file], { root, svgPaths: true, write: false });
		expect(files.find((f) => f.file === 'src/pane.tsx').rules['svg-paths']).toBeUndefined();
		expect(files.some((f) => f.output.endsWith('.svg.octane.ts'))).toBe(false);
	},
);

it('retains the original asset if the selected imported receiver collides with an existing native module', async () => {
	const { root, file } = fixture(`import {Action} from './action';
		import Mark from './icons/mark.svg';
		export function Pane() { return <Action><Mark/></Action>; }`);
	const receiver = path.join(root, 'src/action.tsx');
	fs.writeFileSync(receiver, action);
	fs.writeFileSync(path.join(root, 'src/action.tsrx'), 'export function Different() @{ <div/> }');
	const { files } = await runCodemod([receiver, file], { root, svgPaths: true, write: false });
	expect(files.find((f) => f.file === 'src/pane.tsx').rules['svg-paths']).toBeUndefined();
	expect(files.some((f) => f.output.endsWith('.svg.octane.ts'))).toBe(false);
});

it.each(['inline slot type', 'imported slot type'])(
	'keeps an SVG passed from an unchecked caller out of a text hole with an %s',
	async (kind) => {
		const { root, file } = fixture(`// @ts-nocheck
			import Mark from './icons/mark.svg';
			import {Row} from './row';
			export function Pane() { return <Row icon={<Mark/>}/>; }`);
		const config = path.join(root, 'tsconfig.json');
		const tsconfig = JSON.parse(fs.readFileSync(config, 'utf8'));
		tsconfig.compilerOptions.strict = true;
		fs.writeFileSync(config, JSON.stringify(tsconfig));
		const receiver = path.join(root, 'src/row.tsx');
		const imported = kind === 'imported slot type';
		fs.writeFileSync(
			path.join(root, 'src/model.ts'),
			'export interface RowProps { icon: string; }',
		);
		fs.writeFileSync(
			receiver,
			(imported ? "import type {RowProps} from './model';" : '') +
				`export function Row({icon}: ${imported ? 'RowProps' : '{icon:string}'}) { return <button>{icon}</button>; }`,
		);
		const options = { root, strong: true, verify: true, write: false, projectTypes: imported };
		const migrated = await runCodemod([file, receiver], { ...options, svgPaths: true });
		const original = await runCodemod([file, receiver], { ...options, svgPaths: false });
		const row = (result) => result.files.find((f) => f.file === 'src/row.tsx').code;
		expect(row(migrated)).toMatch(/\{icon as string\}/);
		expect(row(migrated)).toBe(row(original));
		const caller = migrated.files.find((f) => f.file === 'src/pane.tsx');
		expect(caller.rules['svg-paths']).toBeUndefined();
		expect(caller.code).toContain('./icons/mark.svg');
		expect(migrated.files.some((f) => f.output.endsWith('.svg.octane.ts'))).toBe(false);
	},
);

it('only accepts a renderable cast in a selected receiver when its imported type resolves', async () => {
	const { root, file } = fixture(`import Mark from './icons/mark.svg';
		import {Row} from './row';
		export function Pane() { return <Row icon={<Mark/>}/>; }`);
	const config = path.join(root, 'tsconfig.json');
	const tsconfig = JSON.parse(fs.readFileSync(config, 'utf8'));
	tsconfig.compilerOptions.strict = true;
	fs.writeFileSync(config, JSON.stringify(tsconfig));
	fs.writeFileSync(
		path.join(root, 'src/model.ts'),
		'export type Content = string | {type: unknown};',
	);
	const receiver = path.join(root, 'src/row.tsx');
	fs.writeFileSync(
		receiver,
		`import type {Content} from './model';
		export function Row({icon}: {icon: unknown}) { return <button>{icon as Content}</button>; }`,
	);
	const options = { root, svgPaths: true, write: false };
	const caller = (result) => result.files.find((f) => f.file === 'src/pane.tsx');
	expect(
		caller(await runCodemod([file, receiver], { ...options, projectTypes: false })).rules[
			'svg-paths'
		],
	).toBeUndefined();
	expect(caller(await runCodemod([file, receiver], options)).rules['svg-paths']).toBe(1);
});

it.each([
	'icon as string',
	'icon satisfies string',
	'icon as Scalar',
	'icon as string | number',
	'icon as T',
	'icon as UnknownAlias',
	'(icon as string) as Content',
])('keeps a forwarded SVG out of a text or unverified child cast: %s', async (expression) => {
	const { root, file } = fixture(`import Mark from './icons/mark.svg';
		import type {UnknownAlias} from 'unresolved';
		type Scalar = string;
		type Content = string | {type: unknown};
		function Row<T extends string>({icon}) { return <button>{${expression}}</button>; }
		export function Pane() { return <Row icon={<Mark/>}/>; }`);
	const { files } = await runCodemod([file], { root, svgPaths: true, write: false });
	expect(files.find((f) => f.file === 'src/pane.tsx').rules['svg-paths']).toBeUndefined();
	expect(files.some((f) => f.output.endsWith('.svg.octane.ts'))).toBe(false);
});

it('keeps a directly used SVG out of a string child assertion', async () => {
	const { root, file } = fixture(`import Mark from './icons/mark.svg';
		export function Pane() { return <button>{<Mark/> as string}</button>; }`);
	const { files } = await runCodemod([file], { root, svgPaths: true, write: false });
	expect(files.find((f) => f.file === 'src/pane.tsx').rules['svg-paths']).toBeUndefined();
	expect(files.some((f) => f.output.endsWith('.svg.octane.ts'))).toBe(false);
});

it('bounds a deep slot chain without discarding the proof for a shorter path into the same chain', async () => {
	const wrappers = Array.from({ length: 48 }, (_, index) =>
		index === 47
			? 'function Slot47({children}) { return <span>{children}</span>; }'
			: `function Slot${index}({children}) { return <Slot${index + 1}>{children}</Slot${index + 1}>; }`,
	);
	const { root, file, icon } = fixture(`import Deep from './icons/mark.svg';
		import Shallow from './icons/other.svg';
		${wrappers.join('\n')}
		export function Pane() { return <div><Slot0><Deep/></Slot0><Slot30><Shallow/></Slot30></div>; }`);
	fs.copyFileSync(icon, path.join(root, 'src/icons/other.svg'));
	const { files } = await runCodemod([file], { root, svgPaths: true, write: false });
	expect(files.find((f) => f.file === 'src/pane.tsx').rules['svg-paths']).toBe(1);
	expect(files.filter((f) => f.output.endsWith('.svg.octane.ts')).map((f) => f.output)).toEqual([
		'src/icons/other.svg.octane.ts',
	]);
});
