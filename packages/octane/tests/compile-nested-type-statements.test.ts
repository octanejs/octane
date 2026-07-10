import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';

// Type-only STATEMENTS nested below module scope (`type X = …` / `interface I`
// inside a function body — ubiquitous in test files that declare per-test form
// shapes) must be dropped by the runtime emit, same as the top-level ast.body
// filter. Before the stripTsOnlyWrappers array-prune, the per-node strip nulled
// the alias's typeAnnotation and esrap crashed printing `type X = <null>`.

describe('compile — nested type-only statements', () => {
	it('drops a type alias declared inside a function body', () => {
		const src = `
      it('x', () => {
        type FormValues = { firstName: string };
        const values: FormValues = { firstName: 'a' };
        console.log(values);
      });
    `;
		const { code } = compile(src, 'nested-alias.test.tsx');
		expect(code).not.toMatch(/type FormValues/);
		expect(code).toMatch(/firstName: 'a'/);
	});

	it('drops a nested interface declaration', () => {
		const src = `
      function setup() {
        interface Shape { value: number }
        const s: Shape = { value: 1 };
        return s;
      }
      console.log(setup());
    `;
		const { code } = compile(src, 'nested-interface.test.tsx');
		expect(code).not.toMatch(/interface Shape/);
		expect(code).toMatch(/value: 1/);
	});

	it('keeps sparse array holes intact through the strip', () => {
		const src = `
      const arr = [1, , 3];
      console.log(arr);
    `;
		const { code } = compile(src, 'sparse.test.tsx');
		expect(code).toMatch(/\[1, ?, ?3\]|\[\s*1,\s*,\s*3,?\s*\]/);
	});

	it('drops nested type statements inside component bodies', () => {
		const src = `
      export function App() {
        type P = { v: string };
        const p: P = { v: 'x' };
        return <div>{p.v}</div>;
      }
    `;
		const { code } = compile(src, 'nested-in-component.test.tsx');
		expect(code).not.toMatch(/type P/);
	});
});
