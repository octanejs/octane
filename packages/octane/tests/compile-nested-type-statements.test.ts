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

// Inline `type` specifiers (`import { a, type B }`, `export { type C, d }`)
// must be elided exactly like tsc elides them: the emitted JS neither carries
// the invalid `type` keyword nor imports/re-exports a binding that only exists
// as a type. A declaration left with no specifiers disappears entirely.
describe('compile — inline type-only import/export specifiers', () => {
	const src = `
    import { useState, type Dispatch } from 'octane';
    export { type OnlyAType } from './types.js';
    export { type AlsoAType, realValue } from './mixed.js';
    export type * from './star-types.js';
    export type * as StarNs from './star-ns-types.js';
    export * from './star-values.js';

    export function App() {
      const [n] = useState(0);
      return <b>{'n: ' + n}</b>;
    }
  `;

	for (const mode of ['client', 'server'] as const) {
		it(`${mode} emit elides inline type specifiers and keeps value specifiers`, () => {
			const { code } = compile(
				src,
				'inline-type-specifiers.test.tsx',
				mode === 'server' ? { mode: 'server' } : undefined,
			);
			// No TS `type` modifier may survive into the emitted JS.
			expect(code).not.toMatch(/\btype [A-Z]/);
			// The type-only named import must not become a runtime import.
			expect(code).not.toMatch(/\bDispatch\b/);
			// An all-type re-export disappears entirely; a mixed one keeps values.
			expect(code).not.toMatch(/types\.js/);
			expect(code).not.toMatch(/AlsoAType/);
			expect(code).toMatch(/realValue/);
			// `export type * [as Ns]` is elided whole; a value star export stays.
			expect(code).not.toMatch(/StarNs/);
			expect(code).toMatch(/star-values\.js/);
		});
	}
});
