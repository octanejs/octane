import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { slotHooks } from '../../src/compiler/slot-hooks.js';

// Which captures a compiler-inferred dependency array may omit, and which it
// must keep.
//
// The governing rule is that a dependency array tracks values whose identity
// can change BETWEEN RENDERS. A binding evaluated once for the program's
// lifetime cannot, so it is not a dependency — the same conclusion React's
// exhaustive-deps rule reaches for any outer-scope value, and the one two
// neighbouring parts of this compiler already reached:
//
//   - an IMPORTED binding is omitted from an inferred array;
//   - autoMemo's `plainCalleeIsMemoizable` treats a same-module `function`
//     declaration that is never reassigned as a "module-scope immutable
//     identity", explicitly indistinguishable from an import.
//
// A same-module `const`/`function`/`class` is that same identity. Treating it
// as reactive put a dead comparison slot in every array that touched one, and
// made `import { fmt } from '../fmt'` disagree with the byte-identical helper
// declared locally.
//
// The final describe block holds the boundary: `let`, shadowing, and derived
// values stay reactive, because for those the premise does not hold.
const c = (source: string, options?: { mode?: 'client' | 'server'; filename?: string }): string =>
	compile(source, options?.filename ?? 'auto-deps-stability.tsrx', {
		inlineHookMemo: false,
		...options,
	}).code;

// The inferred array, read back from the emitted hook call. The trailing slot
// argument is a numeric index in `.tsrx` output and a Symbol alias in `.tsx`
// output; both forms anchor the match without being asserted themselves.
// One-level method calls compile their dependency to a helper call (the
// own-property discriminator — auto-hook-deps.test.ts pins that emission);
// normalize it back to the authored member spelling because this suite's
// subject is WHICH captures are tracked or omitted, not the comparison form.
const depsOf = (code: string): string[] =>
	[...code.matchAll(/\[([^[\]]*)\],\s*(?:\d+|_h\$\d+)\s*\)/g)].map((match) =>
		match[1]
			.replace(/[\w$]*__methodDep[\w$]*\((\w+), "([^"]+)"\)/g, '$1.$2')
			.replace(/\s+/g, ' ')
			.trim(),
	);

describe('dependency stability — module-scope immutable identities', () => {
	it('omits a module-scope const binding', () => {
		const code = c(`
      import { useEffect } from 'octane';
      const SCALE = 2;
      export function App(props) @{
        useEffect(() => { props.log(props.value * SCALE); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['props.log, props.value']);
	});

	it('omits a module-scope function declaration', () => {
		const code = c(`
      import { useEffect } from 'octane';
      function fmt(n) { return String(n); }
      export function App(props) @{
        useEffect(() => { props.log(fmt(props.value)); });
        <div />
      }
    `);

		// `import { fmt } from './fmt'` with the identical call site must produce
		// the identical array: where the helper is declared cannot change it.
		expect(depsOf(code)).toEqual(['props.log, props.value']);
	});

	it('omits a module-scope const arrow function', () => {
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

	it('omits a module-scope class binding', () => {
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

	it('omits a member read of a module-scope const object', () => {
		const code = c(`
      import { useEffect } from 'octane';
      const CONFIG = { mode: 'fast' };
      export function App(props) @{
        useEffect(() => { props.log(CONFIG.mode); });
        <div />
      }
    `);

		// The receiver is what a dependency would witness, and it is fixed. This
		// matches the answer `import * as CONFIG` + `CONFIG.mode` already gives:
		// a module-level object mutated in place is unwitnessed either way.
		expect(depsOf(code)).toEqual(['props.log']);
	});

	it('omits a module-scope component referenced as a JSX tag', () => {
		const code = c(`
      import { useMemo } from 'octane';
      function Row(props) @{ <li>{props.text as string}</li> }
      export function App(props) @{
        const rows = useMemo(() => props.items.map((t) => <Row text={t} />));
        <ul>{rows}</ul>
      }
    `);

		// A component referenced as a tag is an ordinary capture of its binding.
		expect(depsOf(code)).toEqual(['props.items']);
	});

	it('omits a module-scope const declared after the component', () => {
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

	it('holds the same contract in a server compile', () => {
		const code = c(
			`
      import { useEffect, useMemo } from 'octane';
      const SCALE = 2;
      function fmt(n) { return String(n); }
      export function App(props) @{
        const label = useMemo(() => fmt(props.value * SCALE));
        useEffect(() => { props.log(label); });
        <div>{label as string}</div>
      }
    `,
			{ mode: 'server' },
		);

		expect(depsOf(code)).toEqual(['props.value', 'props.log, label']);
	});

	it('holds the same contract for a .tsx source', () => {
		const code = c(
			`
      import { useEffect } from 'octane';
      const SCALE = 2;
      function fmt(n) { return String(n); }
      export function App(props) {
        useEffect(() => { props.log(fmt(props.value * SCALE)); });
        return <div />;
      }
    `,
			{ filename: 'auto-deps-stability.tsx' },
		);

		expect(depsOf(code)).toEqual(['props.log, props.value']);
	});

	it('holds the same contract in the plain-TS surgical pass', () => {
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

		// The `.tsrx` compiler and this pass must agree on the same source.
		expect(code).toMatch(/useEffect\([^;]*?, \[value\], _h\$\d+\)/);
	});
});

describe('dependency stability — component-local invariants', () => {
	it('omits a component-local const bound to a literal', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const limit = 10;
        useEffect(() => { props.log(limit); });
        <div />
      }
    `);

		// `limit` is 10 on every render by construction, so nothing can witness it.
		expect(depsOf(code)).toEqual(['props.log']);
	});

	it('keeps a component-local const bound to a regex literal', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const pattern = /foo/g;
        useEffect(() => { props.log(pattern); });
        <div />
      }
    `);

		// ESTree spells a regex as a `Literal`, but `/foo/g` allocates a fresh
		// RegExp on every render and carries mutable `lastIndex` state, so it is
		// reactive exactly like an object literal would be.
		expect(depsOf(code)).toEqual(['props.log, pattern']);
	});

	it('keeps a component-local const bound to an object or array literal', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const options = { deep: true };
        const items = [1, 2];
        useEffect(() => { props.log(options, items); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['props.log, options, items']);
	});

	it('omits a component-local const bound to a substitution-free template', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const label = \`total\`;
        useEffect(() => { props.log(label); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['props.log']);
	});

	it('keeps a component-local const bound to an interpolated template', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const label = \`total: \${props.total}\`;
        useEffect(() => { props.log(label); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['props.log, label']);
	});

	it('omits a component-local const aliasing an import', () => {
		const code = c(`
      import { useEffect } from 'octane';
      import { fmt } from './fmt';
      export function App(props) @{
        const f = fmt;
        useEffect(() => { props.log(f(props.value)); });
        <div />
      }
    `);

		// Naming an invariant value does not make it reactive, so an alias must
		// reach the same answer as the binding it aliases.
		expect(depsOf(code)).toEqual(['props.log, props.value']);
	});
});

describe('dependency inference — computed destructuring keys', () => {
	// A computed key is a READ of the surrounding scope, so it is a capture like
	// any other — the object-literal case below is the same read in a position
	// that was never in doubt. Dropping it is a missed dependency: the effect
	// keeps a stale `key` and never re-runs when it changes.
	//
	// Patterns appear in several binding positions, and each reaches the walk
	// differently, so every position gets a case.

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

	it('keeps a module-scope function that some statement reassigns', () => {
		const code = c(`
      import { useEffect } from 'octane';
      function fmt(n) { return String(n); }
      export function install(next) { fmt = next; }
      export function App(props) @{
        useEffect(() => { props.log(fmt(props.value)); });
        <div />
      }
    `);

		// A function binding is writable, unlike a const. Reassigned anywhere in
		// the module — including from inside another function — it is reactive.
		expect(depsOf(code)).toEqual(['props.log, fmt, props.value']);
	});

	it('keeps a module-scope class that some statement reassigns', () => {
		const code = c(`
      import { useEffect } from 'octane';
      class Thing {}
      export function swap(next) { Thing = next; }
      export function App(props) @{
        useEffect(() => { props.log(new Thing()); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['props.log, Thing']);
	});

	it('keeps a module-scope var, which is neither const nor block scoped', () => {
		const code = c(`
      import { useEffect } from 'octane';
      var moduleVar = 0;
      export function App(props) @{
        useEffect(() => { props.log(moduleVar); });
        <div />
      }
    `);

		expect(depsOf(code)).toEqual(['props.log, moduleVar']);
	});

	it('omits an exported module-scope const and function alike', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export const SCALE = 2;
      export function fmt(n) { return String(n); }
      export function App(props) @{
        useEffect(() => { props.log(fmt(props.value * SCALE)); });
        <div />
      }
    `);

		// Exporting a binding does not let anything rebind it from outside.
		expect(depsOf(code)).toEqual(['props.log, props.value']);
	});

	it('omits a name bound by a module-scope const destructuring pattern', () => {
		const code = c(`
      import { useEffect } from 'octane';
      const { mode, sizes: [first] } = { mode: 'fast', sizes: [1] };
      export function App(props) @{
        useEffect(() => { props.log(mode, first); });
        <div />
      }
    `);

		// The pattern runs once at module evaluation, so every name it binds is
		// as fixed as a plain `const`.
		expect(depsOf(code)).toEqual(['props.log']);
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
