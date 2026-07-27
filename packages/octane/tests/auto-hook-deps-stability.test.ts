import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { slotHooks } from '../src/compiler/slot-hooks.js';

// Known GAPS in compiler-inferred hook dependencies, written as executable
// assertions of the intended behaviour.
//
// Every `it.fails` below states what the compiler SHOULD emit and currently
// does not. They stay green while the gap is open and flip red the moment it
// closes — at which point drop the `.fails` rather than deleting the case.
// The plain `it` blocks are the guards those fixes must not break.
//
// The contract being asserted is the same one two neighbouring passes already
// hold, and which `hook-deps.js` alone does not:
//
//   - an IMPORTED binding is already omitted from an inferred array, because a
//     module binding's identity is fixed for the program lifetime;
//   - autoMemo's `plainCalleeIsMemoizable` already treats a same-module
//     `function` declaration that is never reassigned as a "module-scope
//     immutable identity", indistinguishable from an import.
//
// A same-module `const`/`function`/`class` is that same identity, so making it
// a reactive dependency is a dead comparison slot in every emitted array and a
// behavioural difference between `import { fmt } from './fmt'` and the byte
// identical helper declared locally.
const c = (source: string): string =>
	compile(source, 'auto-deps-stability.tsrx', { inlineHookMemo: false }).code;

const depsOf = (code: string): string[] =>
	[...code.matchAll(/\[([^[\]]*)\],\s*\d+\s*\)/g)].map((match) =>
		match[1].replace(/\s+/g, ' ').trim(),
	);

describe('dependency stability — module-scope immutable identities', () => {
	it.fails('omits a module-scope const binding', () => {
		const code = c(`
      import { useEffect } from 'octane';
      const SCALE = 2;
      export function App(props) @{
        useEffect(() => { props.log(props.value * SCALE); });
        <div />
      }
    `);

		// Emits [props.log, props.value, SCALE].
		expect(depsOf(code)).toEqual(['props.log, props.value']);
	});

	it.fails('omits a module-scope function declaration', () => {
		const code = c(`
      import { useEffect } from 'octane';
      function fmt(n) { return String(n); }
      export function App(props) @{
        useEffect(() => { props.log(fmt(props.value)); });
        <div />
      }
    `);

		// Emits [props.log, fmt, props.value]. An `import { fmt } from './fmt'`
		// with the identical call site already emits [props.log, props.value].
		expect(depsOf(code)).toEqual(['props.log, props.value']);
	});

	it.fails('omits a module-scope const arrow function', () => {
		const code = c(`
      import { useEffect } from 'octane';
      const fmt = (n) => String(n);
      export function App(props) @{
        useEffect(() => { props.log(fmt(props.value)); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['props.log, props.value']);
	});

	it.fails('omits a module-scope class binding', () => {
		const code = c(`
      import { useEffect } from 'octane';
      class Thing {}
      export function App(props) @{
        useEffect(() => { props.log(new Thing()); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['props.log']);
	});

	it.fails('omits a member read of a module-scope const object', () => {
		const code = c(`
      import { useEffect } from 'octane';
      const CONFIG = { mode: 'fast' };
      export function App(props) @{
        useEffect(() => { props.log(CONFIG.mode); });
        <div />
      }
    `);

		// Emits [props.log, CONFIG.mode]. `import * as CONFIG` + `CONFIG.mode` is
		// already omitted, so the two spellings disagree on the same read.
		expect(depsOf(code)).toEqual(['props.log']);
	});

	it.fails('omits a module-scope component referenced as a JSX tag', () => {
		const code = c(`
      import { useMemo } from 'octane';
      function Row(props) @{ <li>{props.text as string}</li> }
      export function App(props) @{
        const rows = useMemo(() => props.items.map((t) => <Row text={t} />));
        <ul>{rows}</ul>
      }
    `);

		// Emits [props.items, Row].
		expect(depsOf(code)).toEqual(['props.items']);
	});

	it.fails('omits a module-scope const declared after the component', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        useEffect(() => { props.log(LATER); });
        <div />
      }
      const LATER = 5;
    `);

		// Declaration ORDER must not change the answer: the binding is immutable
		// either way, and the scope walk already predeclares the whole module body.
		expect(depsOf(code)).toEqual(['props.log']);
	});

	it.fails('holds the same contract in the plain-TS surgical pass', () => {
		const source = `
import { useEffect } from 'octane';
import { imported } from './config';
const SCALE = 2;
function helper(n: number) { return n * SCALE; }
export function useThing(value: number) {
  useEffect(() => console.log(imported, helper(value), SCALE));
}
`;
		const code = slotHooks(source, 'use-thing.ts')!.code;

		// Emits [helper, value, SCALE]. Both entry points share hook-deps.js, so
		// the gap and its fix are one and the same.
		expect(code).toMatch(/useEffect\([^;]*?, \[value\], _h\$\d+\)/);
	});
});

describe('dependency stability — component-local invariants', () => {
	it.fails('omits a component-local const bound to a literal', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const limit = 10;
        useEffect(() => { props.log(limit); });
        <div />
      }
    `);

		// Emits [props.log, limit]. `limit` is 10 on every render by construction.
		expect(depsOf(code)).toEqual(['props.log']);
	});

	it.fails('omits a component-local const aliasing an import', () => {
		const code = c(`
      import { useEffect } from 'octane';
      import { fmt } from './fmt';
      export function App(props) @{
        const f = fmt;
        useEffect(() => { props.log(f(props.value)); });
        <div />
      }
    `);

		// Emits [props.log, f, props.value]. markDependencyInvariantBindings
		// propagates `const a = b` through an already-invariant `b`, but an
		// IMPORTED binding is never marked invariant — it is only filtered at the
		// use site — so the alias does not inherit it.
		expect(depsOf(code)).toEqual(['props.log, props.value']);
	});
});

describe('dependency inference — computed destructuring keys', () => {
	// These were missed dependencies, not dead slots: the effect kept a stale
	// `key` and never re-ran when it changed.
	//
	// `buildScopes`'s `walkPatternDefaults` did not visit a computed ObjectPattern
	// key, so those Identifier nodes got no `nodeScopes` entry.
	// `collectDependencies`'s `walkPatternExpression` DOES visit them
	// (`if (prop.computed) walk(prop.key)`) — the intent was never in doubt — but
	// `addIdentifier` resolves through `nodeScopes`, and an unmapped node is
	// indistinguishable from a genuine global, so the capture was skipped.
	//
	// Every binding position that admits a pattern routes through
	// `walkPatternDefaults`, so each of these shapes is a separate entry into it.

	it('tracks a computed key in a declaration inside the callback', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const key = props.key;
        useEffect(() => { const { [key]: picked } = props.map; props.log(picked); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['key, props.map, props.log']);
	});

	it('tracks a computed key in a nested function parameter pattern', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const key = props.key;
        useEffect(() => { const f = ({ [key]: v }) => v; props.log(f(props.map)); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['key, props.log, props.map']);
	});

	it('tracks a computed key nested inside another pattern', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const key = props.key;
        useEffect(() => { const { outer: { [key]: v } } = props.map; props.log(v); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['key, props.map, props.log']);
	});

	it('tracks a computed key inside an array pattern element', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const key = props.key;
        useEffect(() => { const [{ [key]: v }] = props.rows; props.log(v); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['key, props.rows, props.log']);
	});

	it('tracks a computed key in a catch clause parameter', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const key = props.key;
        useEffect(() => {
          try { props.run(); } catch ({ [key]: v }) { props.log(v); }
        });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['props.run, key, props.log']);
	});

	it('tracks a computed key in a for-of declaration', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const key = props.key;
        useEffect(() => { for (const { [key]: v } of props.rows) props.log(v); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['key, props.rows, props.log']);
	});

	it('tracks a computed key alongside a default value in the same pattern', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const key = props.key;
        const fallback = props.fallback;
        useEffect(() => { const { [key]: v = fallback } = props.map; props.log(v); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['key, fallback, props.map, props.log']);
	});

	it('already tracked a computed key in an object LITERAL, for contrast', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const key = props.key;
        useEffect(() => { props.log({ [key]: 1 }); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['props.log, key']);
	});

	it('still binds the pattern names themselves, which are not captures', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const key = props.key;
        useEffect(() => { const { [key]: picked, rest } = props.map; props.log(picked, rest); });
        <div />
      }
    `);

		// `picked`/`rest` are declared inside the callback, so they must NOT appear.
		expect(depsOf(code)).toEqual(['key, props.map, props.log']);
	});
});

describe('dependency stability — guards the fixes must not break', () => {
	it('keeps a module-scope let, which any module statement may rebind', () => {
		const code = c(`
      import { useEffect } from 'octane';
      let hits = 0;
      export function bump() { hits++; }
      export function App(props) @{
        useEffect(() => { props.log(hits); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['props.log, hits']);
	});

	it('keeps a component-local const that shadows a module-scope const', () => {
		const code = c(`
      import { useEffect } from 'octane';
      const SCALE = 2;
      export function App(props) @{
        const SCALE = props.scale;
        useEffect(() => { props.log(SCALE); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['props.log, SCALE']);
	});

	it('keeps a component-local const bound to a reactive expression', () => {
		const code = c(`
      import { useEffect } from 'octane';
      const SCALE = 2;
      export function App(props) @{
        const scaled = props.value * SCALE;
        useEffect(() => { props.log(scaled); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['props.log, scaled']);
	});
});
