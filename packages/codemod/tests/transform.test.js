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
	const result = transformModule(fs.readFileSync(path.join(FIXTURES, name), 'utf8'), name);
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

	it('removes the directive it added after a `"use client"` prologue', async () => {
		const compiler = await loadCompiler(import.meta.dirname);
		const source =
			"'use client';\n\nexport function Raw({ html }: { html: string }) {\n\treturn <div dangerouslySetInnerHTML={{ __html: html }} />;\n}\n";
		const { code } = transformModule(source, 'raw.tsx', { strong: true });
		expect(code).toMatch(/^'use client';\n"use strong";\n\nexport/);
		const result = strengthen(compiler, code, path.join(FIXTURES, 'raw.tsrx'));
		expect(result.strong).toBe(false);
		expect(result.code).toMatch(/^'use client';\n\nexport function Raw/);
	});
});
