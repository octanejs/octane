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
