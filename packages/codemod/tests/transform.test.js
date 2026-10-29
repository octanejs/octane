import fs from 'node:fs';
import path from 'node:path';
import { collectDiagnostics } from 'octane/compiler';
import { describe, expect, it } from 'vitest';
import { loadCompiler, strengthen, transformModule } from '../src/index.js';

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
	for (const input of INPUTS) {
		it(`migrates ${input} to source the compiler accepts`, async () => {
			const { result, output } = migrate(input);
			await expect(result.code).toMatchFileSnapshot(path.join(FIXTURES, output));
			expect(compileErrors(result.code, output)).toEqual([]);
		});
	}

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

	it('moves a key every arm of a conditional row shares to the `@for` header', () => {
		const row = (/** @type {string} */ other) =>
			`export function L({ xs }: { xs: { id: string; a: boolean }[] }) {\n\treturn <ul>{xs.map((x) => (x.a ? <li key={x.id}>a</li> : <b key={${other}}>b</b>))}</ul>;\n}\n`;
		const { code } = transformModule(row('x.id'), 'l.tsx');
		expect(code).toContain('@for (const x of xs; key x.id) {');
		expect(code).toContain('<li>a</li>');
		expect(code).not.toContain('key={');
		// Arms keyed differently stay a `.map()`, so each keeps its own key.
		expect(transformModule(row("'b' + x.id"), 'l.tsx').code).toContain('{xs.map((x) =>');
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

	it('hosts a leaf component of a package with no Octane port in a `ReactCompat` island', () => {
		const migrate = (
			/** @type {string} */ source,
			/** @type {import('../src/transform.js').TransformOptions} */ options = {},
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
		}
		const old = migrate(`${imports}export const App = () => <Toaster />;\n`, {
			reactCompat: false,
		});
		expect([old.code.includes('<ReactCompat>'), old.notes[0].message]).toEqual([
			false,
			'`<Toaster>` can render in a `ReactCompat` island only with React and React DOM 19.2 or newer in the React 19 series. `toast-kit` has no Octane port.',
		]);

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

	it('reads `target` as `currentTarget` on a handler typed for any form control', () => {
		const source =
			'export function F({ set }: { set(v: string): void }) {\n\tconst on = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(e.target.value);\n\treturn <textarea onInput={on} />;\n}\n';
		expect(transformModule(source, 'f.tsx').code).toContain('set(e.currentTarget.value)');
		// A focus event's target is the control too.
		const blur =
			'export function F({ set }: { set(v: string): void }) {\n\treturn <input onBlur={(e) => set(e.target.value)} />;\n}\n';
		expect(transformModule(blur, 'f.tsx').code).toContain('set(e.currentTarget.value)');
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

	it('falls back to compatibility mode and reports what blocks Strong', async () => {
		const compiler = await loadCompiler(import.meta.dirname);
		const source =
			"import { useState } from 'react';\nexport function Raw({ html }: { html: string }) {\n\tconst [open] = useState(false);\n\treturn <div data-open={open} dangerouslySetInnerHTML={{ __html: html }} />;\n}\n";
		const { code } = transformModule(source, 'raw.tsx', { strong: true });
		const result = strengthen(compiler, code, path.join(FIXTURES, 'raw.tsrx'));
		expect(result.strong).toBe(false);
		expect(result.code).not.toContain('use strong');
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
