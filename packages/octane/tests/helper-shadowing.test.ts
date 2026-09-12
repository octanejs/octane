import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import ts from 'typescript';
import { mount } from './_helpers';
import {
	ShadowSetText,
	ShadowHtext,
	ShadowUpdateHelpers,
	ShadowBlocks,
	ShadowModuleScope,
} from './_fixtures/helper-shadowing.tsrx';

// User bindings named after compiler-emitted runtime helpers (setText, htext,
// clone, template, setAttribute, …) must not shadow generated code. The
// compiler imports every generated-code helper under a `_$` alias
// (`import { setText as _$setText } from 'octane'`), so the user's binding and
// the helper coexist. `const [text, setText] = useState('')` is the canonical
// collision — pre-fix, the click below left the span empty AND stored a DOM
// Text node in state (the generated `setText(_b._txt$…, _v)` resolved to the
// user's state setter).

describe('helper shadowing — user bindings named after runtime helpers', () => {
	it('state setter named setText: DOM text updates and state stays a string', () => {
		const r = mount(ShadowSetText);
		expect(r.find('#st-label').textContent).toBe('');
		r.click('#st-btn');
		expect(r.find('#st-label').textContent).toBe('xyz');
		// A second click must be a no-op re-render (same string), not a loop of
		// Text-node states.
		r.click('#st-btn');
		expect(r.find('#st-label').textContent).toBe('xyz');
		r.unmount();
	});

	it('local named htext: mount-path text helper still runs', () => {
		const r = mount(ShadowHtext, { value: 'hello' });
		expect(r.find('#ht-label').textContent).toBe('hello');
		r.update(ShadowHtext, { value: 'world' });
		expect(r.find('#ht-label').textContent).toBe('world');
		r.unmount();
	});

	it('locals named setAttribute/setStyle/setClassName/normalizeClass/child/sibling', () => {
		const r = mount(ShadowUpdateHelpers);
		expect(r.find('#u-attr').getAttribute('title')).toBe('data-0');
		expect(r.find('#u-attr').textContent).toBe('kid-0 sib-0');
		expect((r.find('#u-style') as HTMLElement).style.color).toBe('blue');
		expect(r.find('#u-style').className).toBe('c0');
		expect(r.find('#u-class').className).toBe('n0');
		r.click('#u-btn');
		expect(r.find('#u-attr').getAttribute('title')).toBe('data-1');
		expect(r.find('#u-attr').textContent).toBe('kid-1 sib-1');
		expect((r.find('#u-style') as HTMLElement).style.color).toBe('red');
		expect(r.find('#u-style').className).toBe('c1');
		expect(r.find('#u-class').className).toBe('n1');
		r.unmount();
	});

	it('locals named ifBlock/forBlock/componentSlot: control flow still works', () => {
		const r = mount(ShadowBlocks);
		expect(r.find('#b-if').textContent).toBe('yes');
		expect(r.findAll('#b-list li').map((li) => li.textContent)).toEqual(['a-row', 'b-row']);
		r.click('#b-btn');
		expect(r.container.querySelector('#b-if')).toBe(null);
		r.click('#b-btn');
		expect(r.find('#b-if').textContent).toBe('yes');
		r.unmount();
	});

	it('module-level template/clone/delegateEvents bindings coexist with the prelude', () => {
		// Pre-fix this was a duplicate-declaration SyntaxError at module load
		// (user `function template` vs the prelude's bare `import { template }`).
		const r = mount(ShadowModuleScope);
		expect(r.find('#m-label').textContent).toBe('abab! not-the-runtime');
		r.unmount();
	});

	it('emits helpers aliased and preserves user import specifiers verbatim', () => {
		const src = `
      import { useState, flushSync as fs } from 'octane';
      export function T() @{
        const [text, setText] = useState('');
        <button onClick={() => fs(() => setText('x'))}>{text as string}</button>
      }
    `;
		const { code } = compile(src, 'shadow-emit.tsrx');
		const server = compile(src, 'shadow-emit.tsrx', { mode: 'server' }).code;
		for (const output of [code, server]) {
			const ast = ts.createSourceFile('compiled.ts', output, ts.ScriptTarget.Latest, true);
			const authored: Record<string, string> = {};
			const generated = new Set<string>();
			for (const statement of ast.statements) {
				if (
					!ts.isImportDeclaration(statement) ||
					!ts.isStringLiteral(statement.moduleSpecifier) ||
					!/^octane(?:\/|$)/.test(statement.moduleSpecifier.text)
				)
					continue;
				const bindings = statement.importClause?.namedBindings;
				if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
				for (const binding of bindings.elements) {
					const imported = (binding.propertyName ?? binding.name).text;
					if (imported === 'useState' || imported === 'flushSync')
						authored[imported] = binding.name.text;
					else {
						expect(binding.name.text).toBe(`_$${imported}`);
						generated.add(imported);
					}
				}
			}
			expect(authored).toEqual({ useState: 'useState', flushSync: 'fs' });
			expect(generated.size).toBeGreaterThan(0);
			const visit = (node: ts.Node): void => {
				if (ts.isCallExpression(node) && ts.isIdentifier(node.expression))
					expect(generated.has(node.expression.text)).toBe(false);
				ts.forEachChild(node, visit);
			};
			visit(ast);
		}
	});
});
