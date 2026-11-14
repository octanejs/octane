import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { collectDiagnostics } from 'octane/compiler';
import * as ReactServerBridge from 'octane/react/server';
import { renderToStaticMarkup } from 'octane/server';
import { prerender } from 'octane/static';
import { createElement as reactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { loadCompiledFixtureSource } from '../../octane/tests/_server-fixture.js';
import { loadCompiler, strengthen, transformModule } from '../dist/index.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const INPUTS = fs.readdirSync(FIXTURES).filter((name) => /\.input\.[jt]sx$/.test(name));

/**
 * The compiler's errors for a migrated module: what a build would reject.
 *
 * @param {string} code
 * @param {string} filename
 * @param {boolean} [strong]
 */
function compileErrors(code, filename, strong = false) {
	const result = collectDiagnostics(
		code,
		path.join(FIXTURES, filename),
		strong ? { strong: true } : {},
	);
	return [
		...(result.error == null ? [] : [String(/** @type {any} */ (result.error).message)]),
		...result.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code),
	];
}

/** @param {string} name */
function migrate(name) {
	const result = transformModule(fs.readFileSync(path.join(FIXTURES, name), 'utf8'), name, {
		strictNullChecks: true,
		unported: (specifier) => (specifier === '@example/react-toast' ? specifier : null),
		reactCompat: true,
		// As the project resolves bindings: Radix's primitives are `@octanejs/radix`.
		resolveSpecifier: (specifier) =>
			specifier.startsWith('@radix-ui/react-') ? '@octanejs/radix' : null,
	});
	const output = name
		.replace('.input.', '.output.')
		.replace(/\.[jt]sx$/, (ext) => (result.template ? '.tsrx' : ext));
	return { result, output };
}

describe('transformModule', () => {
	it('distinguishes a custom Array type from the default library', () => {
		const source = `/// <reference no-default-lib="true"/>
declare namespace Vendor {
	interface Array<T> { map<U>(render: (value: T) => U): U[] }
}
export function List({ rows }: { rows: Vendor.Array<string> }) {
	return <ul>{rows.map(label => <li key={label}>{label}</li>)}</ul>;
}`;
		const { code } = transformModule(source, 'list.tsx');
		expect(code).toContain('rows.map(');
	});

	it('flags React SVG import conventions only where their components render in Octane', () => {
		const source = `import { ReactCompat } from 'octane/react';
import { ReactCompat as ServerCompat } from 'octane/react/server';
import Mark from './mark.svg?react';
import url, { ReactComponent as Glyph } from './glyph.svg';
import Shadowed from './shadow.svg?react';
import IslandOnly from './island.svg?react';
import Native from './native.svg';
import Component from './native.tsrx';
export const View = () => <><ReactCompat><span><Mark/><IslandOnly/></span></ReactCompat><ServerCompat><IslandOnly/></ServerCompat><img src={url}/><Native/><Component/><Mark></Mark><Glyph/><Glyph/></>;
export const Local = ({ Shadowed }: { Shadowed: () => null }) => <Shadowed/>;`;
		const result = transformModule(source, 'view.tsx', {
			strong: true,
			get types() {
				throw new Error('SVG import diagnostics must not load project types');
			},
		});
		const notes = result.notes.filter((note) => note.message.includes('SVG import convention'));
		expect(notes.map(({ severity, message }) => [severity, message.split(' uses ')[0]])).toEqual([
			['warning', '`<Mark>`'],
			['warning', '`<Glyph>`'],
		]);
		expect(result.code).toContain("import Mark from './mark.svg?react'");
		expect(result.code).toContain('ReactComponent as Glyph');
	});

	it('reports bare SVG component aliases at their JSX sites, including inside ReactCompat', () => {
		const source = `import { ReactCompat } from 'octane/react';
import Mark from './mark.svg';
import { default as Raw, ReactComponent as Named } from './other.svg';
import Explicit from './mark.svg?react';
import Inline from '!!@svgr/webpack!./mark.svg';
import Query from './mark.svg?fallback=.svg';
import Replaced from './replaced.svg';
import lower from './lower.svg';
const Alias = (Mark satisfies unknown)!;
const Choice = condition ? Fallback : Alias;
export function View({ Mark }) { return <>
  <Choice></Choice>
  <ReactCompat><Raw/></ReactCompat>
  <img src={Raw}/><Mark/><lower/><Named/><Explicit/><Inline/><Query/><Replaced/>
</>; }`;
		const result = transformModule(source, 'view.tsx', {
			resolveSpecifier: (s) => (s === './replaced.svg' ? './replaced.tsrx' : null),
		});
		const lines = source.split('\n');
		expect(
			result.notes.filter((n) => n.rule === 'svg-issuer').map((n) => lines[n.line - 1].trim()),
		).toEqual(['<Choice></Choice>', '<ReactCompat><Raw/></ReactCompat>']);
	});

	it('reports SVG fallback values used as tags and skips values used only as tests', () => {
		const source = `import Mark from './mark.svg';
const Nullish = custom ?? Mark;
const First = Mark ?? other;
const Fallback = custom || Mark;
const Preferred = Mark || other;
const Conditional = enabled && Mark;
const Guard = Mark && OtherIcon;
const Branch = Mark ? OtherIcon : AnotherIcon;
export function Choices() { return <>
  <Nullish/>
  <First/>
  <Fallback/>
  <Preferred/>
  <Conditional/>
  <Guard/>
  <Branch/>
</>; }
export function Slot({ Icon: DefaultIcon = Mark }) { return <DefaultIcon/>; }
export function render(Icon = Mark) { return <Icon/>; }
export function Separate({Icon = Mark}) { function Child(Icon) { return <Icon/>; } return <Child/>; }`;
		const { notes } = transformModule(source, 'view.tsx');
		const lines = source.split('\n');
		expect(
			notes.filter((n) => n.rule === 'svg-issuer').map((n) => lines[n.line - 1].trim()),
		).toEqual([
			'<Nullish/>',
			'<First/>',
			'<Fallback/>',
			'<Preferred/>',
			'<Conditional/>',
			'export function Slot({ Icon: DefaultIcon = Mark }) { return <DefaultIcon/>; }',
			'export function render(Icon = Mark) { return <Icon/>; }',
		]);
	});

	it('reports bare SVG defaults selected by local destructuring', () => {
		const source = `import Mark from './mark.svg';
export function View(props, items) {
  const { icon: ConstIcon = Mark, plain: Plain } = props;
  let { icon: MutableIcon = Mark } = props;
  const [ArrayIcon = Mark] = items;
  return <>
    <ConstIcon/>
    <MutableIcon/>
    <ArrayIcon/>
    <Plain/>
    <img src={MutableIcon}/>
  </>;
}`;
		const lines = source.split('\n');
		const { notes } = transformModule(source, 'view.tsx');
		expect(
			notes.filter((n) => n.rule === 'svg-issuer').map((n) => lines[n.line - 1].trim()),
		).toEqual(['<ConstIcon/>', '<MutableIcon/>', '<ArrayIcon/>']);
	});

	it('checks whether an inline object supplies the destructured tag', () => {
		const source = `import Mark from './mark.svg';
export function View(overrides) {
  const {icon: Native = Mark} = {...overrides, icon: 'span'};
  const {icon: Dynamic = Mark} = {icon: 'span', ...overrides};
  const {icon: Missing = Mark} = {};
  const {icon: Cleared = Mark} = {icon: void 0};
  const {'1': Overridden = Mark} = {'1': 'span', 1n: void 0};
  const {reset, icon: AfterGetter = Mark} = {get reset() {this.icon = undefined}, icon: 'span'};
  return <>
    <Native/>
    <Dynamic/>
    <Missing/>
    <Cleared/>
    <Overridden/>
    <AfterGetter/>
  </>;
}`;
		const lines = source.split('\n');
		const { notes } = transformModule(source, 'view.tsx');
		expect(
			notes.filter((n) => n.rule === 'svg-issuer').map((n) => lines[n.line - 1].trim()),
		).toEqual(['<Dynamic/>', '<Missing/>', '<Cleared/>', '<Overridden/>', '<AfterGetter/>']);
	});

	it('only reports reachable SVG operands in logical tag choices', () => {
		const choices = [
			["'button' || Mark", false],
			['(false && Mark) || Good', false],
			['(() => <span/>) ?? Mark', false],
			['false ?? Mark', false],
			['prop ?? Mark', true],
			['read() || Mark', true],
			['null ?? Mark', true],
			["'' || Mark", true],
			['true && Mark', true],
		];
		for (const [choice, reachable] of choices) {
			const source = `import Mark from './mark.svg';
				export function View({prop, read, Good}) { const Tag = ${choice}; return <Tag/>; }`;
			const { notes } = transformModule(source, 'view.tsx');
			expect(
				notes.some((n) => n.rule === 'svg-issuer'),
				choice,
			).toBe(reachable);
		}
	});

	for (const input of INPUTS) {
		it(`migrates ${input} to source the compiler accepts`, async () => {
			const { result, output } = migrate(input);
			await expect(result.code).toMatchFileSnapshot(path.join(FIXTURES, output));
			expect(compileErrors(result.code, output)).toEqual([]);
		});
	}

	it('renders only the punctuation authored between nested elements', () => {
		const source = `function Tag() { return <b>tag</b>; }
export function Pair() { return <p><Tag />; <Tag /></p>; }`;
		const { code } = transformModule(source, 'pair.tsx', { strong: true });
		const { Pair } = loadCompiledFixtureSource(code, { id: 'pair.tsrx', mode: 'server' });
		expect(renderToStaticMarkup(Pair, {}).html).toBe('<p><b>tag</b>; <b>tag</b></p>');
	});

	it('leaves a module without React untouched', () => {
		const source = "import { helper } from './helper.js';\nexport const value = helper(1);\n";
		expect(transformModule(source, 'value.ts')).toMatchObject({
			code: source,
			changed: false,
			template: false,
		});
	});

	it('keeps React semantics for dependency lists React would not infer', () => {
		const source =
			"import { useEffect, useMemo } from 'react';\nexport function useTitle(t: string) {\n\tuseEffect(() => { document.title = t; });\n\treturn useMemo(() => t.trim());\n}\n";
		const { code } = transformModule(source, 'use-title.ts');
		expect(code).toContain('useEffect(() => { document.title = t; }, null);');
		expect(code).toContain('useMemo(() => t.trim(), null)');
		expect(code).toContain("from 'octane'");
	});

	it('does not add `null` to Octane hooks, whose omitted list already means inferred', () => {
		const source =
			"import { useEffect } from 'octane';\nexport function A({ t }: { t: string }) {\n\tuseEffect(() => { document.title = t; });\n\treturn <p>{t}</p>;\n}\n";
		const { code } = transformModule(source, 'a.tsx');
		expect(code).toContain('useEffect(() => { document.title = t; });');
		expect(code).toContain('@{');
	});

	it('only lowers `&&` to `@if` when the left side is provably boolean', () => {
		const source =
			'export function A({ n, ok }: { n: number; ok: boolean }) {\n\treturn (\n\t\t<div>\n\t\t\t{n && <b />}\n\t\t\t{ok && <i />}\n\t\t\t{n > 0 && <u />}\n\t\t</div>\n\t);\n}\n';
		const { code } = transformModule(source, 'a.tsx');
		// React renders `0` for `n && …`; `@if` would render nothing.
		expect(code).toContain('{n && <b />}');
		expect(code).toContain('@if (n > 0) { <u /> }');
		// `ok` is a boolean, but proving that needs types.
		expect(code).toContain('{ok && <i />}');
	});

	it('recognizes the global Boolean conversion in JavaScript and leaves circular aliases alone', () => {
		const input =
			'export function A({ n }) { const a = b, b = a; return <p>{Boolean(n) && <b />}{a && <i />}</p>; }';
		const { code } = transformModule(input, 'a.jsx');
		expect(code).toContain('@if (Boolean(n))');
		expect(code).toContain('{a && <i />}');
	});

	it('compiles typed boolean guards while preserving numeric children', () => {
		const source = `const Boolean = (n: number) => n;
export function Banner({ visible, count }: { visible?: boolean; count: number }) {
	return <section>{visible && <i>Visible</i>}{Boolean(count) && <b>Count</b>}</section>;
}`;
		const result = transformModule(source, 'banner.tsx', { strong: true, strictNullChecks: true });
		expect(result.rules['template-if']).toBe(1);
		const { Banner } = loadCompiledFixtureSource(result.code, {
			id: 'banner.tsrx',
			mode: 'server',
		});
		const render = (props) => renderToStaticMarkup(Banner, props).html;
		expect(render({ visible: true, count: 1 })).toBe(
			'<section><i>Visible</i><b>Count</b></section>',
		);
		expect(render({ visible: false, count: 0 })).toBe('<section>0</section>');
		expect(render({ count: 0 })).toBe('<section>0</section>');
	});

	it('spells a hole as text only when the project proves it cannot be null', () => {
		const source =
			'export function A({ t, n }: { t: string; n: number }) {\n\treturn <p>{t} {n}</p>;\n}\n';
		expect(transformModule(source, 'a.tsx', { strictNullChecks: true }).code).toContain(
			'<p>{t as string} {String(n)}</p>',
		);
		// Without `strictNullChecks` a `string` may hold null, which React renders as nothing.
		expect(transformModule(source, 'a.tsx').code).toContain('<p>{t} {n}</p>');
		// A JavaScript module's inferred types are not a contract.
		const js =
			'export function A() {\n\tconst t = "a";\n\tlet n = 1;\n\treturn <p>{t} {n}</p>;\n}\n';
		expect(transformModule(js, 'a.jsx', { strictNullChecks: true }).code).toContain(
			'<p>{t} {n}</p>',
		);
		// A local `String` is not the global.
		const shadowed = `const String = (n: number) => 'n';\n${source}`;
		expect(transformModule(shadowed, 'a.tsx', { strictNullChecks: true }).code).toContain(
			'{`${n}`}',
		);
	});

	it.each([
		['a null branch', 'row => row === null ? null : <b key={row.id}>kept</b>', ''],
		[
			'an early return',
			'row => { if (row === null) return null; return <b key={row.id}>kept</b>; }',
			'',
		],
		[
			'an unkeyed fragment branch',
			'row => row === null ? <><i>missing</i></> : <b key={row.id}>kept</b>',
			'<i>missing</i>',
		],
	])('keeps row keys lazy with %s', (_name, row, before) => {
		const source = `export function List({ rows }) {
			return <div>{rows.map(${row})}</div>;
		}`;
		const { code } = transformModule(source, 'list.tsx');
		const { List } = loadCompiledFixtureSource(code, { id: 'list.tsrx', mode: 'server' });
		expect(renderToStaticMarkup(List, { rows: [null, { id: 'kept' }] }).html).toBe(
			`<div>${before}<b>kept</b></div>`,
		);
	});

	it('evaluates a row condition before reading a key shared by both arms', () => {
		const source = `export function List({ rows }) {
			return <div>{rows.map(row => row.active ? <b key={row.id}>first</b> : <b key={row.id}>late</b>)}</div>;
		}`;
		const { code } = transformModule(source, 'list.tsx');
		const { List } = loadCompiledFixtureSource(code, { id: 'list.tsrx', mode: 'server' });
		let readKey = false;
		const row = {
			get id() {
				readKey = true;
				return 'row';
			},
			get active() {
				return !readKey;
			},
		};
		expect(renderToStaticMarkup(List, { rows: [row] }).html).toBe('<div><b>first</b></div>');
		expect(readKey).toBe(true);
	});

	it('turns `if (c) return <A />` guards into `@if`/`@else`', () => {
		const source =
			'export function Node({ depth, ok }: { depth: number; ok: boolean }) {\n\tconst n = depth * 2;\n\tif (depth > 0) return <div class="n"><Node depth={depth - 1} ok={ok} /></div>;\n\tconst label = \'leaf \' + n;\n\tif (!ok) {\n\t\treturn <b>{label}</b>;\n\t}\n\treturn <span>{label}</span>;\n}\n';
		const { code } = transformModule(source, 'node.tsx');
		expect(code).toContain('\tconst n = depth * 2;\n\t@if (depth > 0) {');
		expect(code).toContain(
			"} @else {\n\t\tconst label = 'leaf ' + n;\n\t\t@if (!ok) { <b>{label}</b> } @else { <span>{label}</span> }",
		);
		expect(code).not.toContain('return');
		expect(compileErrors(code, 'node.tsrx')).toEqual([]);
		// A comment before a guard is kept once.
		const commented = source.replace('\tif (depth > 0)', '\t// Recurse.\n\tif (depth > 0)');
		expect(transformModule(commented, 'node.tsx').code.match(/\/\/ Recurse\./g)).toHaveLength(1);
	});

	it('migrates React DOM root types with the renderer', () => {
		const source = `import { createRoot, type Root as ClientRoot } from 'react-dom/client';
import type * as ReactDOM from 'react-dom/client';
import { App } from './App';
const root: ClientRoot = createRoot(document.body);
export const mounted: ReactDOM.Root = root;
export const imported: import('react-dom/client').Root = mounted;
root.render(<App />);`;
		const { code, notes } = transformModule(source, 'main.tsx');
		expect(notes).toEqual([]);
		expect(code).toContain('type Root as ClientRoot');
		expect(code).toContain('type Root as OctaneRoot');
		expect(code).toContain('export const mounted: OctaneRoot = root;');
		expect(code).toContain("import('octane').Root");
		expect(code).toContain('root.render(App);');
		expect(code).not.toContain('react-dom/client');
	});

	it('mounts a root by component, not by element', () => {
		const source = (/** @type {string} */ call) =>
			`import { createElement, StrictMode } from 'react';\nimport { createRoot, hydrateRoot } from 'react-dom/client';\nimport { renderToString } from 'react-dom/server';\nimport { App } from './App';\nconst root = createRoot(document.body);\n${call};\n`;
		const render = (/** @type {string} */ call) =>
			transformModule(source(call), 'main.tsx').code.split('\n').at(-2);
		expect(render('root.render(<App />)')).toBe('root.render(App);');
		expect(render('root.render(<StrictMode><App size={2} {...rest} on /></StrictMode>)')).toBe(
			'root.render(App, { size: 2, ...rest, on: true });',
		);
		expect(render('root.render(createElement(App, { depth: 10 }))')).toBe(
			'root.render(App, { depth: 10 });',
		);
		expect(render('createRoot(document.body).render(createElement(App))')).toBe(
			'createRoot(document.body).render(App);',
		);
		expect(render('hydrateRoot(document.body, <App size={2} />)')).toBe(
			'hydrateRoot(document.body, App, { size: 2 });',
		);
		// React's server renderers return the HTML; Octane's return `{ html, css }`.
		expect(render('renderToString(createElement(App))')).toBe('renderToString(App).html;');
		expect(render('renderToString(<div />)')).toBe('renderToString(<div />).html;');
		// A key, a ref, or children keep the element.
		expect(render('root.render(<App key="a" />)')).toBe('root.render(<App key="a" />);');
		expect(transformModule(source('root.render(<App />)'), 'main.tsx').code).not.toContain(
			'StrictMode',
		);
	});

	it('lowers `&&` to `@if` through a `const` that holds a comparison', () => {
		const source =
			'export function A({ n }: { n: number }) {\n\tconst any = n > 0;\n\tlet some = n > 0;\n\treturn <p>{any && <b />}{some && <i />}</p>;\n}\n';
		const { code } = transformModule(source, 'a.tsx');
		expect(code).toContain('@if (any) { <b /> }');
		// A `let` can be reassigned to a number.
		expect(code).toContain('{some && <i />}');
	});

	it('flags React Three Fiber, whose scene belongs in a `.three.tsrx` module', () => {
		const source =
			"import { Canvas } from '@react-three/fiber';\nexport function S() {\n\treturn <Canvas><mesh /></Canvas>;\n}\n";
		expect(transformModule(source, 's.tsx').notes).toMatchObject([
			{ rule: 'unsupported-api', severity: 'error', line: 1 },
		]);
	});

	it("renders a TanStack root shell's document through the router's components", () => {
		const source =
			'import { HeadContent } from \'@tanstack/react-router\';\nexport function Shell({ children }: { children: unknown }) {\n\treturn <html lang="en"><head><HeadContent /></head><body>{children as any}</body></html>;\n}\n';
		const { code } = transformModule(source, 'root.tsx');
		expect(code).toContain('<Html lang="en"><Head><HeadContent /></Head><Body>');
		expect(code).toContain("import { Html, Head, Body } from '@octanejs/tanstack-router';");
		// Outside a router module, `<html>` is the element.
		expect(
			transformModule(source.replace('@tanstack/react-router', './x'), 'root.tsx').code,
		).toContain('<html lang="en">');
	});

	it('ports providers of a context made on either branch, and providers read as values', () => {
		const source =
			"import { createContext } from 'react';\nconst C = DEV ? createContext(1) : createContext(2);\nexport const P = C.Provider;\nexport function A() {\n\treturn <C.Provider value={1}><i /></C.Provider>;\n}\n";
		const { code } = transformModule(source, 'c.tsx');
		expect(code).toContain('export const P = C;');
		expect(code).toContain('<C value={1}><i /></C>');
	});

	it('imports a React name read only in types as a type', () => {
		const source =
			"import { ReactNode, useState } from 'react';\nexport function A({ c }: { c: ReactNode }) {\n\tconst [n] = useState(0);\n\treturn <p>{c}{n}</p>;\n}\n";
		expect(transformModule(source, 'a.tsx').code).toContain(
			"import { type ReactNode, useState } from 'octane';",
		);
		// In the quotes the module's own imports use.
		expect(transformModule(source.replaceAll("'", '"'), 'a.tsx').code).toContain(
			'import { type ReactNode, useState } from "octane";',
		);
	});

	it('keeps ref allocator re-exports and type queries on the original React API', () => {
		const { code, notes } = transformModule(
			`import type * as R from 'react';
export { createRef as allocate, useState } from 'react';
export type { createRef as RefFactory } from 'react';
export type Direct = typeof import('react').createRef;
export type Qualified = typeof R.createRef;`,
			'refs.ts',
		);
		expect(notes).toEqual([]);
		expect(code).toMatch(/export \{\s*createRef as allocate,?\s*\} from 'react'/);
		expect(code).toMatch(/export \{\s*useState\s*\} from 'octane'/);
		expect(code).toContain("export type { createRef as RefFactory } from 'react';");
		expect(code).toContain("typeof import('react').createRef");
		const imported = /import type \{\s*createRef(?: as (\w+))?\s*\} from 'react'/.exec(code);
		expect(imported).not.toBeNull();
		expect(code).toContain(`export type Qualified = typeof ${imported?.[1] ?? 'createRef'};`);
	});

	it("imports `useSyncExternalStore` from Octane, not React's shim for it", () => {
		const { code } = transformModule(
			"import { useEffect } from 'react';\nimport { useSyncExternalStore } from 'use-sync-external-store/shim';\nexport const useOnline = (s: { on(f: () => void): () => void; get(): boolean }) => {\n\tuseEffect(() => {}, []);\n\treturn useSyncExternalStore(s.on, s.get);\n};\n",
			'online.ts',
		);
		expect(code).toContain("import { useEffect, useSyncExternalStore } from 'octane';\n");
		expect(code).not.toContain('use-sync-external-store');
	});

	it("maps the global `React` namespace React's types declare, unless a name shadows it", () => {
		const source =
			'export const A: React.FC<{ c: React.ReactNode }> = ({ c }) => {\n\tconst onInput = (e: React.ChangeEvent<HTMLInputElement>) => e;\n\treturn <input onInput={onInput} title={String(c)} />;\n};\n';
		const { code } = transformModule(source, 'a.tsx');
		expect(code).toContain("import type { FC, OctaneNode, ChangeEvent } from 'octane';");
		expect(code).toContain('export const A: FC<{ c: OctaneNode }>');
		expect(code).toContain('(e: ChangeEvent<HTMLInputElement>)');
		const shadowed = "import * as React from './my-react';\nexport type T = React.ReactNode;\n";
		expect(transformModule(shadowed, 'b.ts').code).toBe(shadowed);
	});

	it('migrates React submit events and keeps the browser event type reachable', () => {
		const { code, notes } = transformModule(
			`import type * as R from 'react';
			import type {SubmitEvent as Submission, SubmitEventHandler as SubmitHandler} from 'react';
			export type BrowserSubmit = SubmitEvent;
			export type NativeEvent = 'first';
			export type OctaneNativeEvent = 'local';
			export type ReactSubmit = R.SubmitEvent<HTMLFormElement>;
			export function Form() {
				const submit: SubmitHandler<HTMLFormElement> = (event) => {
					event.preventDefault();
					event.stopPropagation();
				};
				function reset(event: Submission<HTMLFormElement>) {
					event.currentTarget.reset();
				}
				return <form onSubmit={submit} onSubmitCapture={reset}/>;
			}`,
			'form.tsx',
		);
		expect(notes.filter((n) => n.severity === 'error')).toEqual([]);
		expect(code).toContain('NativeEvent as OctaneNativeEvent_');
		expect(code).toContain(
			'EventHandler<OctaneNativeEvent_<HTMLFormElement, globalThis.SubmitEvent>>',
		);
		expect(code).toContain('type BrowserSubmit = SubmitEvent');
		expect(code).toContain("type OctaneNativeEvent = 'local'");
		expect(code).toContain(
			'type ReactSubmit = OctaneNativeEvent_<HTMLFormElement, globalThis.SubmitEvent>',
		);
		expect(code).toContain('event.preventDefault()');
		expect(code).toContain('event.stopPropagation()');
		expect(code).toContain('event.currentTarget.reset()');
	});

	it('rewrites React submit types without changing script scope', () => {
		const { code, notes } = transformModule(
			`type Submit = import('react').SubmitEventHandler;
			type Plain = React.SubmitEvent;`,
			'form-types.ts',
		);
		const native = "import('octane').NativeEvent<globalThis.Element, globalThis.SubmitEvent>";
		expect(notes.filter((n) => n.severity === 'error')).toEqual([]);
		expect(code).toContain("type Submit = import('octane').EventHandler<" + native + '>');
		expect(code).toContain('type Plain = ' + native);
		expect(code).not.toMatch(/^import type/m);
	});

	it('retains synthetic operations in a contextually typed React submit handler for review', () => {
		const { code, notes } = transformModule(
			`import type {SubmitEventHandler as Submission} from 'react';
			const submit: Submission<HTMLFormElement> = (event) => event.nativeEvent;
			export function Form() { return <form onSubmit={submit}/>; }`,
			'form.tsx',
		);
		expect(code).toContain('event.nativeEvent');
		expect(notes).toContainEqual(
			expect.objectContaining({ rule: 'event-object', severity: 'error' }),
		);
	});

	it('reports synthetic operations in contextually typed generic React event handlers', () => {
		const { notes } = transformModule(
			`import type { ReactEventHandler as LoadHandler } from 'react';
			function Frame(props: { onLoad: LoadHandler<HTMLIFrameElement> }) {
				return <iframe onLoad={props.onLoad} />;
			}
			export function App() {
				return <Frame onLoad={(event) => event.isDefaultPrevented()} />;
			}`,
			'frame.tsx',
		);
		expect(notes).toContainEqual(
			expect.objectContaining({ rule: 'event-object', severity: 'error' }),
		);
	});

	it('rewrites a generic React handler import type without changing script scope', () => {
		const { code, notes } = transformModule(
			"type Load = import('react').ReactEventHandler;",
			'frame-types.ts',
		);
		expect(notes.filter((n) => n.severity === 'error')).toEqual([]);
		expect(code).toBe("type Load = import('octane').EventHandler<import('octane').NativeEvent>;");
	});

	it.each(['React.SubmitEvent | null', '(React.SubmitEvent)'])(
		'checks synthetic reads with a wrapped %s annotation',
		(type) => {
			const { notes } = transformModule(
				`export function Form() {
					return <form onSubmit={(event: ${type}) => event?.isDefaultPrevented()}/>;
				}`,
				'form.tsx',
			);
			expect(notes).toContainEqual(
				expect.objectContaining({ rule: 'event-object', severity: 'error' }),
			);
		},
	);

	it.each([
		'let submit: Submit; submit = (event) => event.isDefaultPrevented();',
		'const callbacks: {onSubmit: Submit} = {onSubmit(event) { event.isDefaultPrevented(); }}; const submit = callbacks.onSubmit;',
		'function make(): Submit { return (event) => event.isDefaultPrevented(); } const submit = make();',
		'function keep(handler: Submit) { return handler; } const submit = keep((event) => event.isDefaultPrevented());',
		'const config = {handler: null as any as Submit}; config.handler = (event) => event.isDefaultPrevented(); const submit = config.handler;',
		'const config = {handler: null as any as React.SubmitEventHandler}; config.handler = (event) => event.isDefaultPrevented(); const submit = config.handler;',
		'const submit: Submit = (event: any) => event.isDefaultPrevented();',
		'const submit: Submit = async (event) => { await 0; event.currentTarget.getAttribute("name"); };',
	])('checks contextual submit handlers in %s', (body) => {
		const { notes } = transformModule(
			`import type {SubmitEventHandler as Submit} from 'react';
			${body}
			export function Form() { return <form onSubmit={submit}/>; }`,
			'form.tsx',
		);
		expect(notes).toContainEqual(
			expect.objectContaining({ rule: 'event-object', severity: 'error' }),
		);
	});

	it.each(['Submit', 'R.SubmitEventHandler', "import('react').SubmitEventHandler"])(
		'checks a forwarded JSX callback typed as %s',
		(handler) => {
			const { notes } = transformModule(
				`import type {SubmitEventHandler as Submit} from 'react';
			import type * as R from 'react';
			function Inner(props: {onSubmit: ${handler}<HTMLFormElement>}) {
				return <form onSubmit={props.onSubmit}/>;
			}
			export function Form() {
				return <Inner onSubmit={(event) => event.isDefaultPrevented()}/>;
			}`,
				'form.tsx',
			);
			expect(notes).toContainEqual(
				expect.objectContaining({ rule: 'event-object', severity: 'error' }),
			);
		},
	);

	it('keeps the handler itself and its props bag distinct from the submit event', () => {
		const { code, notes } = transformModule(
			`import type {SubmitEventHandler as Submit} from 'react';
			function forward(callback: Submit<HTMLFormElement>) { register(callback); }
			export function Form(props: {onSubmit: Submit<HTMLFormElement>}) {
				forward(props.onSubmit);
				return <form onSubmit={props.onSubmit}/>;
			}`,
			'form.tsx',
		);
		expect(notes.filter((n) => n.severity === 'error')).toEqual([]);
		expect(code).toContain('register(callback)');
	});

	it.each(['SubmitEvent', 'SubmitEventHandler'])(
		'keeps the React %s import type when globalThis is shadowed',
		(name) => {
			const { code, notes } = transformModule(
				`declare namespace globalThis { type Element = string; type SubmitEvent = string; }
			export type Submit = import('react').${name}<HTMLFormElement>;`,
				'form-types.ts',
			);
			expect(code).toContain(`import('react').${name}<HTMLFormElement>`);
			expect(notes.filter((n) => n.rule === 'unsupported-api')).toEqual([
				expect.objectContaining({ rule: 'unsupported-api', severity: 'error' }),
			]);
		},
	);

	it.each(['SubmitEvent', 'ReactEventHandler'])(
		'retains a React %s re-export for review',
		(name) => {
			const source = `export type {${name} as EventType} from 'react';`;
			const { code, notes } = transformModule(source, 'form-types.ts');
			expect(code).toBe(source);
			expect(notes).toContainEqual(
				expect.objectContaining({ rule: 'unsupported-api', severity: 'error' }),
			);
		},
	);

	it('migrates sibling exports and keeps comments on the React submit type re-export', () => {
		const { code, notes } = transformModule(
			"export { /* hook */ useState, /* event */ type SubmitEvent as Submission } from 'react';\n" +
				"export type {SubmitEventHandler, ReactNode as Node} from 'react';",
			'form-types.ts',
		);
		expect(code).toMatch(/export \{\s*\/\* hook \*\/ useState,?\s*\} from 'octane';/);
		expect(code).toMatch(
			/export \{\s*\/\* event \*\/ type SubmitEvent as Submission\s*\} from 'react';/,
		);
		expect(code).toMatch(/export type \{\s*ReactNode as Node\s*\} from 'octane';/);
		expect(
			notes.filter((note) => note.rule === 'unsupported-api' && note.severity === 'error'),
		).toHaveLength(2);
	});

	it.each([
		`const handlers: { submit: Submit; change: (v: {value: string}) => void } = {
			submit(e) { e.isDefaultPrevented(); },
			change(v) { inspect(v.value); },
		};`,
		`const handlers: readonly [React.SubmitEventHandler, (v: {value: string}) => void] = [
			(e) => e.isDefaultPrevented(),
			(v) => inspect(v.value),
		];`,
		`const handlers: Array<import('react').SubmitEventHandler> = [
			(e) => e.isDefaultPrevented(),
		];`,
		`const handlers = ({
			submit(e: any) { e.isDefaultPrevented(); },
			change(v) { inspect(v.value); },
		}) as { submit: Submit; change: (v: {value: string}) => void };`,
		`const handlers: Readonly<[Submit, (v: {value: string}) => void]> = [
			(e) => e.isDefaultPrevented(),
			(v) => inspect(v.value),
		];`,
		'const submit: NonNullable<Submit | undefined> = (e) => e.isDefaultPrevented();',
		'type Identity<T> = T; const submit: Identity<Submit> = (e) => e.isDefaultPrevented();',
	])('checks only the submit handler in a typed callback collection', (body) => {
		const { notes } = transformModule(
			`import type {SubmitEventHandler as Submit} from 'react';
			${body}`,
			'form.tsx',
		);
		expect(
			notes.filter((note) => note.rule === 'event-object' && note.severity === 'error'),
		).toHaveLength(1);
	});

	it('checks the imported submit type without treating a local React type as synthetic', () => {
		const { notes } = transformModule(
			`declare namespace React { interface SubmitEvent { value: string } }
			function local(event: React.SubmitEvent) { inspect(event.value); }
			export function native(event: import('react').SubmitEvent) { event.isDefaultPrevented(); }`,
			'form.tsx',
		);
		expect(
			notes.filter((note) => note.rule === 'event-object' && note.severity === 'error'),
		).toHaveLength(1);
	});

	it('checks escaped React imports and avoids a decoded marker-name collision', () => {
		const { notes } = transformModule(
			String.raw`import type {Submit\u0045vent as Event} from 'react';
			function submit<__octaneChec\u006bedEvent>(e: Event | any) { e.isDefaultPrevented(); }`,
			'form.tsx',
		);
		expect(
			notes.filter((note) => note.rule === 'event-object' && note.severity === 'error'),
		).toHaveLength(1);
	});

	it('keeps type projections that select synthetic-only submit members for review', () => {
		const { notes } = transformModule(
			`import type {SubmitEvent as Submission} from 'react';
			type Event = Submission<HTMLFormElement>;
			export type ReactPersist = Pick<Event, 'persist'>;
			export type ReactNative = Event['nativeEvent'];
			export type Form = Pick<Event, 'currentTarget'>;
			function submit(event: ReactPersist) { event.persist(); }`,
			'form-types.ts',
		);
		expect(
			notes.filter((note) => note.rule === 'unsupported-api' && note.severity === 'error'),
		).toHaveLength(2);
		expect(
			notes.filter((note) => note.rule === 'event-object' && note.severity === 'error'),
		).toHaveLength(1);
	});

	it.each([
		'event.target.elements',
		'event.constructor === globalThis.SubmitEvent',
		'event.currentTarget = document.createElement("form")',
		'queueMicrotask(() => event.eventPhase)',
		'queueMicrotask(() => event.currentTarget.reset())',
		'event.isDefaultPrevented()',
		'event.isPropagationStopped()',
		'event.persist()',
		'event.nativeEvent.submitter',
		'event["target"]',
		'publish(event)',
		'publish(event.preventDefault)',
		'(() => { const {target} = event; return target; })()',
	])('reports unsupported React submit event behavior for %s', (expression) => {
		const { notes } = transformModule(
			`import type { SubmitEvent as Submission } from 'react';
			type FormSubmitEvent = Submission<HTMLFormElement>;
			function submit(event: FormSubmitEvent) { ${expression}; }
			export function Form() { return <form onSubmit={submit}/>; }`,
			'form.tsx',
		);
		expect(notes).toContainEqual(
			expect.objectContaining({ rule: 'event-object', severity: 'error' }),
		);
	});

	it('marks a component that reads its `children` as an element `descriptorChildren`', () => {
		const migrate = (/** @type {string} */ source) => transformModule(source, 'tip.tsx');
		// Base UI clones `render`; React hands the component an element.
		const tip = migrate(
			'const Tip = ({ children }: { children: React.ReactElement }) => <Trigger render={children} />;\nexport function Row({ c }: { c: boolean }) {\n\treturn <div><Tip>{c ? <span /> : <a href="#" />}</Tip>{c ? <b /> : <i />}</div>;\n}\nfunction Trigger(_: { render: unknown }) {\n\treturn null;\n}\n',
		);
		expect(tip.code).toContain(
			'const Tip = descriptorChildren(({ children }: { children: OctaneElement }) => @{ <Trigger render={children} /> });',
		);
		// Its children stay elements: an `@if` would hand it a fragment.
		expect(tip.code).toContain(
			'<div><Tip>{c ? <span /> : <a href="#" />}</Tip>@if (c) { <b /> } @else { <i /> }</div>',
		);
		expect(compileErrors(tip.code, 'tip.tsrx')).toEqual([]);
		// Through a type assertion too.
		for (const read of [
			'children as React.ReactElement',
			'children!',
			'(children satisfies object)',
		]) {
			expect(
				migrate(
					`const Tip = ({ children }: { children?: React.ReactNode }) => <Trigger render={${read}} />;\nfunction Trigger(_: { render: unknown }) {\n\treturn null;\n}\n`,
				).code,
			).toContain('const Tip = descriptorChildren(');
		}
		// A declaration becomes a marked `const`, unless the module reads it before.
		const slot =
			"import { Children, cloneElement } from 'react';\nexport function Slot(props: { children: React.ReactElement }) {\n\treturn cloneElement(Children.only(props.children), { id: 's' });\n}\n";
		expect(migrate(slot).code).toContain(
			"export const Slot = descriptorChildren(function Slot(props: { children: OctaneElement }) {\n\treturn cloneElement(Children.only(props.children), { id: 's' });\n});",
		);
		// It is reported instead when code that runs while the module loads can
		// reach it first (directly, in a callback, or through a local call), when
		// it has overloads, or when it is not at module level, where the compiler
		// reads the marker.
		const local = slot.replace('export ', '');
		for (const [source, marked] of /** @type {[string, boolean][]} */ ([
			[`export const routes = [<Slot />];\n${local}`, false],
			[
				`function make() {\n\treturn Slot({ children: <b /> });\n}\nexport const made = make();\n${local}`,
				false,
			],
			[`export const list = [1].map(() => Slot({ children: <b /> }));\n${local}`, false],
			[`export const v = (() => Slot({ children: <b /> }))();\n${local}`, false],
			// `String` calls the object's `toString` while the module loads.
			[`export const s = String({ toString: () => Slot({ children: <b /> }) });\n${local}`, false],
			[
				`const cb = () => Slot({ children: <b /> });\nexport const list = [1].map(cb);\n${local}`,
				false,
			],
			[
				slot.replace(
					'export function Slot',
					'export function Slot(props: { children: React.ReactElement; id: string }): React.ReactElement;\nexport function Slot',
				),
				false,
			],
			[
				"import { cloneElement } from 'react';\nexport function Outer() {\n\tconst Inner = ({ children }: { children: React.ReactElement }) => cloneElement(children, {});\n\treturn <Inner><b /></Inner>;\n}\n",
				false,
			],
			// A function that is only defined, or an imported call, runs nothing of the module's.
			[`export const Row = () => <Slot><b /></Slot>;\nconst v = String(1);\n${local}`, true],
			[
				`import { memo } from 'react';\nexport const Row = memo(() => <Slot><b /></Slot>);\n${local}`,
				true,
			],
		])) {
			const result = migrate(source);
			expect([
				result.code.includes('descriptorChildren('),
				result.notes.map((n) => n.rule),
			]).toEqual(marked ? [true, []] : [false, ['descriptor-children']]);
		}
		// Through `forwardRef` or `memo`, the declaration holds the call.
		expect(
			migrate(
				"import { forwardRef, isValidElement } from 'react';\nexport const P = forwardRef<HTMLElement, { children: React.ReactNode }>(({ children }, ref) => (isValidElement(children) ? <b ref={ref} /> : null));\n",
			).code,
		).toContain('export const P = descriptorChildren(({ children, ref }');
	});

	it.each([
		['object ref', 'check(image.current)', '<Image ref={image} />', true],
		[
			'forwarded callback',
			'{ check(String(!!image.current)); }',
			'<Image {...props} ref={node => { ref?.(node); image.current = node; }} />',
			true,
		],
		['native node', 'check(image.current)', '<img ref={image} />', false],
		[
			'explicit boundary',
			'check(image.current)',
			'<ReactCompat><Image ref={image} /></ReactCompat>',
			false,
		],
		['later spread', 'check(image.current)', '<Image ref={image} {...props} />', false],
		['cleanup only', '() => check(image.current)', '<Image ref={image} />', false],
		['deferred read', 'later(() => check(image.current))', '<Image ref={image} />', false],
		['write only', '{ image.current = null; }', '<Image ref={image} />', false],
		['other ref', 'check(other.current)', '<Image ref={image} />', false],
		['passive effect', 'check(image.current)', '<Image ref={image} />', false],
		['unreachable layout effect', 'check(image.current)', '<Image ref={image} />', false],
		[
			'changed callback argument',
			'check(image.current)',
			'<Image ref={node => { node = null; image.current = node; }} />',
			false,
		],
	])('checks the original layout effect timing for %s', (label, effect, jsx, issue) => {
		const model = `
			import { useRef, useLayoutEffect, useEffect } from 'react';
			import { ReactCompat } from 'octane/react';
			import { Image } from 'retained-image';
			export function Preview({ref, ...props}) {
				const image = useRef(null), other = useRef(null);
				${label === 'unreachable layout effect' ? 'if (false) ' : ''}${label === 'passive effect' ? 'useEffect' : 'useLayoutEffect'}(() => ${effect}, []);
				return ${jsx};
			}
		`;
		const result = transformModule(model, 'preview.tsx', {
			unported: (source) => (source === 'retained-image' ? source : null),
			reactCompat: true,
		});
		const notes = result.notes.filter((note) => note.rule === 'react-island-layout-ref');
		if (issue) {
			expect(result.unported).toEqual([{ name: 'retained-image', islands: 1, blocked: 0 }]);
			expect(notes).toEqual([expect.objectContaining({ severity: 'error' })]);
		} else expect(notes).toEqual([]);
	});

	it('hosts a leaf component of a package with no Octane port in a `ReactCompat` island', () => {
		const migrate = (
			/** @type {string} */ source,
			/** @type {import('../dist/transform.js').TransformOptions} */ options = {},
		) =>
			transformModule(source, 'toast.tsx', {
				strictNullChecks: true,
				unported: (specifier) => (specifier.startsWith('toast-kit') ? 'toast-kit' : null),
				reactCompat: true,
				...options,
			});
		const imports = "import { Toaster, toast, useToaster, ToastContext } from 'toast-kit';\n";
		const source = `${imports}const options = { duration: 2 };\nexport function App({ label }: { label: string }) {\n\treturn <main onClick={() => toast(label)}><Toaster position="top-right" options={options} /><Toaster>{label} and text</Toaster></main>;\n}\n`;
		const app = migrate(source);
		expect(app.code).toContain(
			"import { ReactCompat } from 'octane/react';\n// No Octane port of `toast-kit` exists, so its components render in React through ReactCompat.\nimport { Toaster, toast, useToaster, ToastContext } from 'toast-kit';\n",
		);
		expect(app.code).toContain(
			'<ReactCompat><Toaster position="top-right" options={options} /></ReactCompat><ReactCompat><Toaster>{label} and text</Toaster></ReactCompat>',
		);
		expect([app.notes, app.unported]).toEqual([
			[],
			[{ name: 'toast-kit', islands: 2, blocked: 0 }],
		]);
		expect(compileErrors(app.code, 'toast.tsrx')).toEqual([]);
		// A second run leaves the islands and the comment as they are.
		const tsx = migrate(source, { target: 'tsx' }).code;
		expect(tsx.match(/<ReactCompat>/g)?.length).toBe(2);
		expect(migrate(tsx, { target: 'tsx' }).code).toBe(tsx);

		// React cannot render what Octane renders, call Octane's hooks, or read
		// its contexts; without React 19.2 there is no island at all.
		const crossing = '`<Toaster>` takes children or props that Octane renders';
		for (const [body, message] of [
			['<Toaster>{children}</Toaster>', crossing],
			['<Toaster>{children as ReactNode}</Toaster>', crossing],
			['<Toaster>{(<b />) as any}</Toaster>', crossing],
			['<Toaster icon={<b />} />', crossing],
			['<Toaster icon={children} />', crossing],
			['<Toaster render={row} />', crossing],
			['<Toaster render={(t) => <b>{t}</b>} />', crossing],
			['<Toaster render={renderToast} />', crossing],
			['useToaster(), null', '`useToaster` is a React hook'],
			['useContext(ToastContext), null', '`ToastContext` is a React context'],
		]) {
			const result = migrate(
				`${imports}import { useContext, type ReactNode } from 'react';\nconst row = <b />;\nfunction renderToast(t: string) {\n\treturn <b>{t}</b>;\n}\nexport function App({ children }: { children: ReactNode }) {\n\treturn (${body});\n}\n`,
			);
			expect([
				result.code.includes('<ReactCompat>'),
				result.notes.map((note) => note.message.split(', which')[0]),
			]).toEqual([false, [message]]);
			expect(result.code).toContain(
				'// No Octane port of `toast-kit` exists, and this module needs one: Octane cannot call its hooks, read its contexts, or pass Octane content to its components.\n',
			);
			expect(result.code.includes(`<NoOctanePort error="${result.notes[0].message}">`)).toBe(
				message === crossing,
			);
		}
		// Where no island can host it, the element throws its error as it would
		// render, rather than failing deep in Octane's renderer.
		const old = migrate(`${imports}export const App = () => <Toaster />;\n`, {
			reactCompat: false,
			target: 'tsx',
		});
		expect([old.code.includes('<ReactCompat>'), old.notes[0].message]).toEqual([
			false,
			'`<Toaster>` can render in a `ReactCompat` island only with React and React DOM 19.2 or newer in the React 19 series. `toast-kit` has no Octane port.',
		]);
		expect(old.code).toContain(
			`export const App = () => <NoOctanePort error="${old.notes[0].message}"><Toaster /></NoOctanePort>;\n\nfunction NoOctanePort({ error }: { error: string; children?: unknown }): never {\n  throw new Error(error);\n}\n`,
		);
		expect(migrate(old.code, { reactCompat: false, target: 'tsx' }).code).toBe(old.code);
		// Once React 19.2 is installed, a later run hosts it in an island instead.
		const upgraded = migrate(old.code, { target: 'tsx' });
		expect([upgraded.code.includes('NoOctanePort'), upgraded.unported]).toEqual([
			false,
			[{ name: 'toast-kit', islands: 1, blocked: 0 }],
		]);
		expect(upgraded.code).toContain(
			'export const App = () => <ReactCompat><Toaster /></ReactCompat>;\n',
		);

		// Through a namespace import too; a function call stays as it is, and a
		// type-only import says nothing.
		const named = migrate(
			"import * as Kit from 'toast-kit/react';\nimport type { Toast } from 'toast-kit';\nexport const notify = (t: Toast) => Kit.toast(t);\nexport const App = () => <Kit.Toaster />;\nexport const useCount = () => Kit.useToaster().length;\n",
		);
		expect(named.code).toContain(
			'export const App = () => @{ <ReactCompat><Kit.Toaster /></ReactCompat> };',
		);
		expect(named.code).toContain("import type { Toast } from 'toast-kit';");
		expect(named.code.match(/No Octane port/g)?.length).toBe(1);
		expect(named.notes.map((note) => note.message.split(', which')[0])).toEqual([
			'`Kit.useToaster` is a React hook',
		]);
		expect(
			migrate("import { toast } from 'toast-kit';\nexport const notify = () => toast('hi');\n")
				.code,
		).toBe(
			"// No Octane port of `toast-kit` exists; React stays a dependency for it.\nimport { toast } from 'toast-kit';\nexport const notify = () => toast('hi');\n",
		);
		// A re-export hides the package from the modules that render it.
		expect(migrate("export { Toaster } from 'toast-kit';\n").notes).toMatchObject([
			{ rule: 'bindings', severity: 'warning' },
		]);
	});

	it.each([
		['named alias', "import { ReactCompatInline as Inline } from 'octane/react';", 'Inline'],
		[
			'server namespace',
			"import * as Bridge from 'octane/react/server';",
			'Bridge.ReactCompatInline',
		],
	])('keeps a %s inline React boundary inside its paragraph', async (_, imported, tag) => {
		const source = `${imported}
			import { Badge } from 'badge-kit';
			export function View() {
				return <p><${tag}><Badge /></${tag}></p>;
			}`;
		const result = transformModule(source, 'View.tsx', {
			target: 'tsrx',
			strong: true,
			reactCompat: true,
			unported: (module) => (module === 'badge-kit' ? module : null),
		});
		expect(result.notes.filter((note) => note.severity === 'error')).toEqual([]);
		expect(result.rules['react-compat']).toBeUndefined();
		const { View } = loadCompiledFixtureSource(result.code, {
			id: 'View.tsrx',
			mode: 'server',
			runtimeModules: {
				'octane/react/server': ReactServerBridge,
				'badge-kit': { Badge: () => reactElement('b', null, 'badge') },
			},
		});
		const { html } = await prerender(View, {});
		const dom = new JSDOM(html);
		try {
			const { document } = dom.window;
			expect(document.querySelector('p > span[data-react-compat] > b')?.textContent).toBe('badge');
			expect(document.querySelectorAll('[data-react-compat]')).toHaveLength(1);
		} finally {
			dom.window.close();
		}
	});

	it('passes a text field wrapper its rest props `onChange` as `onInput`', () => {
		const migrate = (/** @type {string} */ body) =>
			transformModule(
				`export function F({ id, ...props }: React.ComponentProps<"input">) {\n\t${body}\n}\n`,
				'f.tsx',
			);
		const wrapper = migrate('return <input type={props.type} id={id} {...props} />;');
		expect(wrapper.code).toContain('export function F({ id, onChange, ...props }');
		// Before the spread, so a caller's own `onInput` still wins.
		expect(wrapper.code).toContain(
			'<input type={props.type} id={id} onInput={onChange} {...props} />',
		);
		expect(compileErrors(wrapper.code, 'f.tsrx')).toEqual([]);
		expect(migrate('return (\n\t\t<textarea\n\t\t\t{...props}\n\t\t/>\n\t);').code).toContain(
			'\t<textarea\n\t\tonInput={onChange}\n\t\t{...props}\n\t/>',
		);
		// A checkbox's native `change` already fires when React's `onChange` does.
		expect(migrate('return <input type="checkbox" {...props} />;').code).not.toContain('onInput');
		// Another read of the rest would lose `onChange`, so it is reported instead.
		const shared = migrate('return <label><input {...props} /><output {...props} /></label>;');
		expect(shared.code).not.toContain('onInput');
		expect(shared.notes.map((note) => note.rule)).toEqual(['native-text-change']);
		expect(
			migrate('return <input title={String(props.onChange)} {...props} />;').code,
		).not.toContain('onInput');
		// A rest without `onChange` has nothing to pass on.
		const named = transformModule(
			'export function F({ onChange, ...props }: React.ComponentProps<"input">) {\n\treturn <input {...props} />;\n}\n',
			'f.tsx',
		);
		expect([named.code.includes('onInput'), named.notes]).toEqual([false, []]);
	});

	it("treats Base UI's text fields as text fields, through a wrapper's nested rest too", () => {
		// Base UI's `Input` renders an `<input>` and hands it the `onChange` it gets.
		const wrapper = transformModule(
			[
				"import { Input as InputPrimitive } from '@base-ui/react/input';",
				"import { Field } from '@base-ui/react/field';",
				'export function Input({ nativeInput, ...props }: InputPrimitive.Props & { nativeInput?: boolean }) {',
				'\tif (nativeInput) {',
				'\t\tconst { style, ...native } = props;',
				'\t\treturn <input {...(native as React.ComponentProps<"input">)} />;',
				'\t}',
				'\treturn <InputPrimitive data-slot="input" {...props} />;',
				'}',
				'export function Name({ name, set }: { name: string; set(v: string): void }) {',
				'\treturn <Field.Control value={name} onChange={(e) => set(e.currentTarget.value)} />;',
				'}',
				'',
			].join('\n'),
			'input.tsx',
		);
		expect(wrapper.notes).toEqual([]);
		// Taken where the component receives it, so both fields still get it.
		expect(wrapper.code).toContain('export function Input({ nativeInput, onChange, ...props }');
		expect(wrapper.code).toContain('const { style, ...native } = props;');
		expect(wrapper.code).toContain(
			'<input onInput={onChange} {...(native as ReactDOMProps<ComponentProps<"input">>)} />',
		);
		expect(wrapper.code).toContain(
			'<InputPrimitive data-slot="input" onInput={onChange} {...props} />',
		);
		expect(wrapper.code).toContain(
			'<Field.Control value={name} onInput={(e) => set(e.currentTarget.value)} />',
		);
		// A nested pattern that takes `onChange` itself keeps the parent's rest whole.
		const named = transformModule(
			[
				"import { Input } from '@base-ui/react';",
				'export function F({ id, ...props }: Input.Props) {',
				'\tconst { onChange: _, ...rest } = props;',
				'\treturn <Input {...rest} />;',
				'}',
				'',
			].join('\n'),
			'f.tsx',
		);
		expect(named.code).not.toContain('onInput');
	});

	it('reads `target` as `currentTarget` on a handler typed for any form control', () => {
		const source =
			'export function F({ set }: { set(v: string): void }) {\n\tconst on = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(e.target.value);\n\treturn <textarea onInput={on} />;\n}\n';
		expect(transformModule(source, 'f.tsx').code).toContain('set(e.currentTarget.value)');
		// A focus event's target is the control too.
		const blur =
			'export function F({ set }: { set(v: string): void }) {\n\treturn <input onBlur={(e) => set(e.target.value)} />;\n}\n';
		expect(transformModule(blur, 'f.tsx').code).toContain('set(e.currentTarget.value)');
	});

	it.each([
		'<Cell {...row.props} key={row.id}>{row.read()}</Cell>',
		'<Cell ref={row.ref} key={row.id}>{row.read()}</Cell>',
		'<Cell value={row.read()} key={row.id} key={row.other}/>',
		'<Cell value={row.read()} key={row.id}><i>{row.read()}</i></Cell>',
		'<Cell value={row.read()} key={row.id}>{row.ok && <i />}</Cell>',
		'<ns.Cell value={row.read()} key={row.id}/>',
	])('reports an unproven mapped JSX evaluation order for %s', (row) => {
		const source =
			'function Cell(props) {return <b/>} export function List({rows}) {return <main>{rows.map(row => ' +
			row +
			')}</main>}';
		const result = transformModule(source, 'list.tsx', { automaticReactJsx: true });
		expect(result.notes).toContainEqual(
			expect.objectContaining({ rule: 'template-for', severity: 'error' }),
		);
		expect(result.code).not.toContain('@for');
	});

	it('runs map setup before a row key that can throw', () => {
		const source = `export function List({ rows }: { rows: { check(): void; id: string }[] }) {
			return <div>{rows.map(row => {
				row.check();
				return <b key={row.id} />;
			})}</div>;
		}`;
		const { code } = transformModule(source, 'list.tsx');
		const { List } = loadCompiledFixtureSource(code, { id: 'list.tsrx', mode: 'server' });
		const row = {
			check() {
				throw new Error('setup-first');
			},
			get id() {
				throw new Error('key-first');
			},
		};
		expect(() => renderToStaticMarkup(List, { rows: [row] })).toThrow('setup-first');
	});

	it('keeps a row setup read ahead of a key that mutates its source', () => {
		const source = `export function List() {
			let label = 'before';
			const rows = [{ get id() { label = 'after'; return 'row'; } }];
			return <div>{rows.map(row => {
				const saved = label;
				return <b key={row.id}>{saved}</b>;
			})}</div>;
		}`;
		const { code } = transformModule(source, 'list.tsx');
		const { List } = loadCompiledFixtureSource(code, { id: 'list.tsrx', mode: 'server' });
		expect(renderToStaticMarkup(List, {}).html).toBe('<div><b>before</b></div>');
	});

	it.each([
		[
			'literal setup',
			"[{ id: 'row' }, { id: 'next' }]",
			"const label = 'ready';",
			'row.id',
			'<b>ready</b><b>ready</b>',
		],
		[
			'an already-bound string key',
			"['row', 'next']",
			'const label = row.toUpperCase();',
			'row',
			'<b>ROW</b><b>NEXT</b>',
		],
		[
			'already-bound primitive keys',
			'[true, false, null, +1, -2, -3n]',
			'const label = String(row);',
			'row',
			'<b>true</b><b>false</b><b>null</b><b>1</b><b>-2</b><b>-3</b>',
		],
		[
			'a signed numeric initializer',
			"[{ id: 'row' }, { id: 'next' }]",
			'const label = -2;',
			'row.id',
			'<b>-2</b><b>-2</b>',
		],
	])('migrates a keyed row with %s', (_name, rows, setup, key, html) => {
		const source = `export function List() {
			return <div>{${rows}.map(row => {
				${setup}
				return <b key={${key}}>{label}</b>;
			})}</div>;
		}`;
		const result = transformModule(source, 'list.tsx', { strong: true });
		expect(compileErrors(result.code, 'list.tsrx', true)).toEqual([]);
		const { List } = loadCompiledFixtureSource(result.code, { id: 'list.tsrx', mode: 'server' });
		expect(renderToStaticMarkup(List, {}).html).toBe(`<div>${html}</div>`);
	});

	it('keeps a row key that can read setup through eval', () => {
		const source = `export function List({ rows }: { rows: string[] }) {
			return <div>{rows.map(row => {
				const label = 'ready';
				return <b key={eval('label')} data-row={row}>{label}</b>;
			})}</div>;
		}`;
		const { code } = transformModule(source, 'list.tsx');
		const { List } = loadCompiledFixtureSource(code, { id: 'list.tsrx', mode: 'server' });
		expect(renderToStaticMarkup(List, { rows: ['row'] }).html).toBe(
			'<div><b data-row="row">ready</b></div>',
		);
	});

	it.each(['"row"', "{'row'}", '{true}', '{false}', '{null}', '{+1}', '{-2}', '{-3n}'])(
		'migrates a literal key %s after row setup',
		(key) => {
			const source = `export function List({ rows }: { rows: string[] }) {
			return <div>{[...rows].map(row => {
				const label = row.toUpperCase();
				return <b key=${key}>{label}</b>;
			})}</div>;
		}`;
			const { code } = transformModule(source, 'list.tsx', { strong: true });
			expect(compileErrors(code, 'list.tsrx', true)).toEqual([]);
			const { List } = loadCompiledFixtureSource(code, { id: 'list.tsrx', mode: 'server' });
			expect(renderToStaticMarkup(List, { rows: ['row'] }).html).toBe('<div><b>ROW</b></div>');
		},
	);

	it('preserves setup before a bigint key that throws during unary plus', () => {
		const source = `export function List({ check }: { check(): void }) {
			return <div>{[1].map(row => {
				check();
				return <b key={+1n}>{row}</b>;
			})}</div>;
		}`;
		const { code } = transformModule(source, 'list.tsx');
		const { List } = loadCompiledFixtureSource(code, { id: 'list.tsrx', mode: 'server' });
		expect(() =>
			renderToStaticMarkup(List, {
				check() {
					throw new Error('setup-first');
				},
			}),
		).toThrow('setup-first');
		expect(() => renderToStaticMarkup(List, { check() {} })).toThrow(TypeError);
	});

	it('keeps a `.map()` whose row writes an outer variable', () => {
		const source =
			'export function A({ xs }: { xs: string[] }) {\n\tlet n = 0;\n\treturn <ul>{xs.map((x) => { const i = n++; return <li key={x}>{i}</li>; })}</ul>;\n}\n';
		expect(transformModule(source, 'a.tsx').code).toContain('{xs.map((x) => {');
	});

	it('keeps `//` and `/*` in element text as text', () => {
		const source = 'export function A() {\n\treturn <p>see .changeset/*.md, a // b</p>;\n}\n';
		const { code } = transformModule(source, 'a.tsx');
		expect(code).toContain("<p>see .changeset{'/'}*.md, a {'/'}/ b</p>");
		expect(compileErrors(code, 'a.tsrx')).toEqual([]);
	});

	it('guards a render-prop `children` call against a compiled children block', () => {
		const source =
			"export function R({ children, v }: { children: any; v: number }) {\n\treturn <p>{typeof children === 'function' ? children(v) : children}</p>;\n}\n";
		const { code } = transformModule(source, 'r.tsx');
		expect(code).toContain(
			"(typeof children === 'function' && !isChildrenBlock(children)) ? children(v) : children",
		);
		expect(code).toContain("import { isChildrenBlock } from 'octane';");
		const again = transformModule(code, 'r.tsrx').code;
		expect(again.match(/isChildrenBlock\(/g)).toHaveLength(1);
	});

	it('flags `flushSync`, whose passive effects stay queued in Octane', () => {
		const source =
			"import { flushSync } from 'react-dom';\nexport function go(f: () => void) {\n\tflushSync(f);\n}\n";
		expect(transformModule(source, 'go.ts').notes).toMatchObject([
			{ rule: 'flush-sync', severity: 'warning', line: 3 },
		]);
	});

	it('leaves a module already migrated untouched', () => {
		for (const input of INPUTS) {
			const { result, output } = migrate(input);
			if (output.endsWith('.tsrx')) continue;
			expect(transformModule(result.code, output).code).toBe(result.code);
		}
	});

	it('resolves names by scope, not by spelling', () => {
		const { result } = migrate('hardening.input.tsx');
		// A parameter named `useEffect` is not React's hook.
		expect(result.code).toContain('useEffect(() => {});');
		// A local `React` is not the namespace import.
		expect(result.code).toContain('console.log(React.useState());');
		// An inner parameter shadowing the event keeps its own `nativeEvent`.
		expect(result.code).toContain('const inner = (e: { nativeEvent: string }) => e.nativeEvent;');
		// The DOM's `MouseEvent` stays reachable.
		expect(result.code).toContain('type MouseEvent as OctaneMouseEvent');
		expect(result.code).toContain("new MouseEvent('focus')");
	});

	it('lowers a dense array with separate row names and preserves real receiver captures', () => {
		const source = (items) => `export function Menu(row = "outer") {
  const __items = "outer";
  return <ul>{${items}.map(({row}) => <li key={row}>{row as string}</li>)}</ul>;
}`;
		const literal = '[{row:"A"}, {row:((row) => row.toUpperCase())("b")}]';
		for (const iterable of [
			literal,
			`(${literal} as const)`,
			`(${literal} satisfies { row: string }[])`,
			`(${literal}!)`,
		]) {
			const { code } = transformModule(source(iterable), 'menu.tsx', { strong: true });
			expect(compileErrors(code, 'menu.tsrx', true), iterable).toEqual([]);
			const { Menu } = loadCompiledFixtureSource(code, { id: 'menu.tsrx', mode: 'server' });
			expect(renderToStaticMarkup(Menu, {}).html).toBe('<ul><li>A</li><li>B</li></ul>');
		}
		for (const retained of [
			'[{row}]',
			'[{[row]:"value",row:"B"}]',
			'([, {row:"B"}] as const)',
			'[{row:eval("row")}]',
			'[{row:eval("__items")}]',
		]) {
			const kept = transformModule(source(retained), 'menu.tsx', { strong: true });
			expect(compileErrors(kept.code, 'menu.tsrx', true), retained).toContain(
				'OCTANE_STRONG_MAP_JSX',
			);
		}
	});

	it('retains a dense array map when its callback can observe the call arguments', () => {
		const source = `export function Menu() {
  return <ul>{[{row:'A'}].map(function ({row}) {
    const size = eval('arguments[2].length');
    return <li key={row}>{String(size)}</li>;
  })}</ul>;
}`;
		const { code } = transformModule(source, 'menu.tsx', { strong: true });
		expect(compileErrors(code, 'menu.tsrx', true)).toContain('OCTANE_STRONG_MAP_JSX');
	});

	it('retains map dispatch on filtered collections even when the row binding is separate', () => {
		const source = `export function Menu(props: { row: string[] }) {
  return <ul>{props.row.filter(row => row !== 'hidden').map(row => <li key={row}>{row}</li>)}</ul>;
}`;
		const { code } = transformModule(source, 'menu.tsx');
		expect(compileErrors(code, 'menu.tsrx', true)).toContain('OCTANE_STRONG_MAP_JSX');
		const { Menu } = loadCompiledFixtureSource(code, { id: 'menu.tsrx', mode: 'server' });
		expect(renderToStaticMarkup(Menu, { row: ['B', , 'hidden', 'A'] }).html).toBe(
			'<ul><li>B</li><li>A</li></ul>',
		);
		// A callback that closes over an outer row must keep reading that row.
		const captured = source
			.replace('props: { row: string[] }', "props: { row: string[] }, row = 'hidden'")
			.replace("row => row !== 'hidden'", 'value => value !== row');
		const kept = transformModule(captured, 'menu.tsx', { strong: true });
		expect(compileErrors(kept.code, 'menu.tsrx', true)).toContain('OCTANE_STRONG_MAP_JSX');
		// A collection can define its own filter and map order.
		const custom =
			'{ filter(fn: (v: string) => boolean): { map(fn: (v: string) => unknown): unknown } }';
		for (const type of [custom, 'string[] | ' + custom]) {
			const collection = transformModule(
				source.replace('row: string[]', 'row: ' + type),
				'menu.tsx',
				{ strong: true },
			);
			expect(compileErrors(collection.code, 'menu.tsrx', true)).toContain('OCTANE_STRONG_MAP_JSX');
		}
	});

	it('keeps a list as `.map()` when an `@for` would change what it reads', () => {
		const { result } = migrate('hardening.input.tsx');
		// `@for (const items of items)` would read `items` before it is bound.
		expect(result.code).toContain('{items.map((items) =>');
		// A `function` row reads its own `this`.
		expect(result.code).toContain('{notes.map(function (note) {');
	});

	it('carries comments from rewritten spans', () => {
		const { result } = migrate('hardening.input.tsx');
		expect(result.code).toContain('// The list of notes.');
		expect(result.code).toContain('{/* Only shown with notes. */}');
		expect(result.code.match(/Rendered as preformatted text/g)).toHaveLength(1);
		// A literal inside a moved arm keeps its exact value.
		expect(result.code).toContain('`first line\n  second line`');
	});

	it('maps dynamic imports of React modules', () => {
		const source =
			"export async function mount(el: Element) {\n\tconst { createRoot } = await import('react-dom/client');\n\treturn createRoot(el);\n}\n";
		expect(transformModule(source, 'mount.ts').code).toContain("await import('octane');");
	});

	it('maps `import()` types of React modules', () => {
		const source =
			"export type Node = import('react').ReactNode;\nexport type Click = import('react').SyntheticEvent<HTMLElement>;\nexport type Component = import('react').FC<{ id: string }>;\n";
		const { code } = transformModule(source, 'types.ts');
		expect(code).toContain("Node = import('octane').OctaneNode;");
		expect(code).toContain("Click = import('octane').NativeEvent<HTMLElement>;");
		expect(code).toContain("Component = import('octane').FC<{ id: string }>;");
	});

	it('rewrites inside a remapped `import()` type', () => {
		const source = "export type Boxed = import('./box').Box<import('react').ReactNode>;\n";
		const { code } = transformModule(source, 'types.ts', {
			resolveSpecifier: (specifier) => (specifier === './box' ? './box.tsrx' : null),
		});
		expect(code).toContain("Boxed = import('./box.tsrx').Box<import('octane').OctaneNode>;");
	});

	it("gives a JSX runtime consumer `createElement` for React's `jsx` and `jsxs`", () => {
		const source = [
			"import { toJsxRuntime } from 'hast-util-to-jsx-runtime';",
			"import { Fragment, jsx, jsxs as many } from 'react/jsx-runtime';",
			'export const render = (tree: any) => toJsxRuntime(tree, { Fragment, jsx, jsxs: many });',
			'',
		].join('\n');
		const { code, notes } = transformModule(source, 'render.ts');
		expect(notes).toEqual([]);
		expect(code).not.toContain('react/jsx-runtime');
		expect(code).toContain("import { Fragment, createElement } from 'octane';");
		// React's runtime takes the key apart from the props; Octane's reads it from them.
		expect(code).toContain(
			'function jsx(type: Parameters<typeof createElement>[0], props: Record<string, unknown>, key?: string | number) {\n  return createElement(type, key === undefined ? props : { ...props, key });\n}\nconst many = jsx;',
		);
		const js = transformModule(
			"import { jsx } from 'react/jsx-runtime';\nexport const p = jsx('p', {}, 'k');\n",
			'p.js',
		);
		expect(js.code).toContain('function jsx(type, props, key) {');
	});

	it('rewrites self-closing context providers', () => {
		const source =
			"import { createContext } from 'react';\nconst Theme = createContext('light');\nexport function A() {\n\treturn <Theme.Provider value=\"dark\" />;\n}\n";
		expect(transformModule(source, 'a.tsx').code).toContain('<Theme value="dark" />');
	});

	it('reports what it cannot migrate', () => {
		const { result } = migrate('legacy.input.tsx');
		expect(result.notes.map((note) => `${note.severity} ${note.rule}`)).toEqual([
			'error unsupported-api',
			'error class-component',
		]);
	});

	it('keeps `.tsx` and JSX with `--target tsx`', () => {
		const source = fs.readFileSync(path.join(FIXTURES, 'counter.input.tsx'), 'utf8');
		const { code, template } = transformModule(source, 'counter.tsx', { target: 'tsx' });
		expect(template).toBe(false);
		expect(code).toMatch(/^\/\*\* @jsxImportSource octane \*\//);
		expect(code).toContain('return (');
		expect(code).toContain("from 'octane'");
		expect(compileErrors(code, 'counter.tsx')).toEqual([]);
	});
});

describe('strengthen', () => {
	it('applies the compiler-guided fixes that make a module Strong', async () => {
		const compiler = await loadCompiler(import.meta.dirname);
		const source = fs.readFileSync(path.join(FIXTURES, 'strong.input.tsx'), 'utf8');
		const { code } = transformModule(source, 'strong.tsx', { strong: true });
		const result = strengthen(compiler, code, path.join(FIXTURES, 'strong.strong.tsrx'));
		await expect(result.code).toMatchFileSnapshot(path.join(FIXTURES, 'strong.strong.tsrx'));
		expect(result).toMatchObject({ strong: true, blockers: [] });
		expect([...result.fixed].sort()).toEqual([
			'OCTANE_STRONG_EXPLICIT_DEPENDENCIES',
			'OCTANE_STRONG_RENDER_REF_READ',
			'OCTANE_STRONG_UNLINKED_PROP_STATE',
		]);
		expect(compileErrors(result.code, 'strong.strong.tsrx', true)).toEqual([]);
	});

	it.each([
		{
			name: 'a callable state initializer',
			hook: 'useState',
			type: 'number | (() => number)',
			args: 'props.initial',
			initial: () => 7,
			strong: true,
		},
		{
			name: 'a parenthesized reducer initial value',
			hook: 'useReducer',
			type: 'number',
			args: '(value: number, next: number) => next, (props.initial),',
			initial: 7,
			strong: true,
		},
		{
			name: 'a reducer initializer supplied by a spread',
			hook: 'useReducer',
			type: '[number, (value: number) => number]',
			args: '(value: number, next: number) => next, ...props.initial',
			initial: [3, (value) => value + 4],
			strong: false,
		},
		{
			name: 'the effect of an explicitly undefined reducer initializer',
			hook: 'useReducer',
			type: 'number; observe: () => void',
			args: '(value: number, next: number) => next, props.initial, void props.observe()',
			initial: 7,
			strong: false,
			observations: 1,
		},
	])(
		'preserves $name during Strong conversion',
		async ({ hook, type, args, initial, strong, observations = 0 }) => {
			const source = `import { ${hook} } from 'react';
export function Counter(props: {initial: ${type}}) {
	const [value, update] = ${hook}(${args});
	return <button onClick={() => update(9)}>{String(value)}</button>;
}`;
			const compiler = await loadCompiler(import.meta.dirname);
			const { code } = transformModule(source, 'counter.tsx', { strong: true });
			const result = strengthen(compiler, code, 'counter.tsrx');
			expect(result).toMatchObject({
				strong,
				blockers: strong ? [] : [{ code: 'OCTANE_STRONG_UNLINKED_PROP_STATE' }],
			});
			const { Counter } = loadCompiledFixtureSource(result.code, {
				id: 'counter.tsrx',
				mode: 'server',
			});
			let observed = 0;
			const observe = () => {
				observed++;
			};
			expect(renderToStaticMarkup(Counter, { initial, observe }).html).toBe('<button>7</button>');
			expect(observed).toBe(observations);
		},
	);

	it('falls back to compatibility mode and reports what blocks Strong', async () => {
		const compiler = await loadCompiler(import.meta.dirname);
		const source =
			"import { useState } from 'react';\nexport function Raw({ html }: { html: string }) {\n\tconst [open] = useState(false);\n\treturn <div data-open={open} dangerouslySetInnerHTML={{ __html: html }} />;\n}\n";
		const { code } = transformModule(source, 'raw.tsx', { strong: true });
		const result = strengthen(compiler, code, path.join(FIXTURES, 'raw.tsrx'));
		expect(result.strong).toBe(false);
		expect(result.code).not.toContain('use strong');
		expect(result.fixed).toEqual(['OCTANE_STRONG_READ_ONLY_STATE']);
		expect(result.code).toContain('const open = useInitialValue(false);');
		expect(result.blockers.map((b) => `${b.severity} ${b.code}`)).toEqual([
			'warning OCTANE_STRONG_UNTRUSTED_HTML',
		]);
		expect(compileErrors(result.code, 'raw.tsrx')).toEqual([]);
	});

	it.each([
		["'use client';\n\n", /^'use client';\n\n"use strong";\nexport/],
		['/* a comment */ ', /^"use strong";\n\n\/\* a comment \*\/ export/],
	])('removes the directive it added after %j on fallback', async (prologue, added) => {
		const compiler = await loadCompiler(import.meta.dirname);
		const body =
			'export function Raw({ html }: { html: string }) {\n\treturn <div dangerouslySetInnerHTML={{ __html: html }} />;\n}\n';
		const { code } = transformModule(prologue + body, 'raw.tsx', { strong: true });
		expect(code).toMatch(added);
		const result = strengthen(compiler, code, path.join(FIXTURES, 'raw.tsrx'));
		expect(result.strong).toBe(false);
		expect(result.code.startsWith(prologue + 'export function Raw')).toBe(true);
		// Blockers point at the written file, which no longer has the directive.
		const line = result.code.split('\n').findIndex((l) => l.includes('dangerouslySetInnerHTML'));
		expect(result.blockers.map((b) => b.line)).toEqual([line + 1]);
	});

	it('leaves no blank line where the directive was in a module from JavaScript', async () => {
		const compiler = await loadCompiler(import.meta.dirname);
		const body =
			'export function Raw({ html }) {\n\treturn <div dangerouslySetInnerHTML={{ __html: html }} />;\n}\n';
		const { code } = transformModule(body, 'raw.jsx', { strong: true });
		expect(code.startsWith('// @ts-nocheck\n"use strong";\nexport')).toBe(true);
		const result = strengthen(compiler, code, path.join(FIXTURES, 'raw.tsrx'));
		expect(result.code.startsWith('// @ts-nocheck\nexport function Raw')).toBe(true);
	});
});
