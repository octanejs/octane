import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// A function argument to a hook call is reallocated every render, so a hook
// that compares it — a store selector feeding an identity-keyed memo being the
// motivating case — redoes work whose inputs never moved. When the function
// captures nothing from the component it cannot behave differently between
// renders or instances, so production compiles lift it to module scope and it
// keeps one identity for the module's lifetime.
//
// Identity stability is not observable through rendered output, so these are
// necessarily source-level: they assert only that the authored function did or
// did not stay at its call site, never the generated name or layout.

const PROD = { hmr: false as const, dev: false };
const DEV = { hmr: 'vite' as const, dev: true };

/** The argument text still sitting inline at the `useSelector` call site. */
function selectorArgs(code: string): string[] {
	return [...code.matchAll(/useSelector,[^\n]*?,\s*([^\n]*)\);/g)].map((m) => m[1]);
}

function hoistCount(code: string): number {
	return [...code.matchAll(/const _fn\$\d+ =/g)].length;
}

describe('capture-free hook callbacks are lifted to module scope', () => {
	it('lifts a selector that captures nothing from the component', () => {
		const code = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        export function App(props) @{
          const total = useSelector(props.store, (s) => s.total);
          <p>{total as string}</p>
        }
      `,
			'lift.tsrx',
			PROD,
		).code;
		expect(hoistCount(code)).toBe(1);
		// The call site now receives a reference, not a fresh function.
		expect(selectorArgs(code)).toEqual(['_fn$0']);
	});

	it('keeps a selector that reads component state at its call site', () => {
		const code = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        export function App(props) @{
          const item = useSelector(props.store, (s) => s.items[props.id]);
          <p>{item as string}</p>
        }
      `,
			'capturing.tsrx',
			PROD,
		).code;
		expect(hoistCount(code)).toBe(0);
		expect(selectorArgs(code)[0]).toContain('props.id');
	});

	it('lifts a selector that only reaches module-scope and global bindings', () => {
		const code = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        import { pick } from './pick';
        export function App(props) @{
          const a = useSelector(props.store, (s) => pick(s));
          const b = useSelector(props.store, (s) => Math.max(s.n, 0));
          <p>{a + '/' + b}</p>
        }
      `,
			'module-scope.tsrx',
			PROD,
		).code;
		expect(hoistCount(code)).toBe(2);
	});

	it('declines when a component binding shadows the module binding it would reach', () => {
		// `pick` resolves to the component's local, so the function is
		// instance-specific even though an identically named module import exists.
		const code = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        import { pick } from './pick';
        export function App(props) @{
          const pick = props.pick;
          const a = useSelector(props.store, (s) => pick(s));
          <p>{a as string}</p>
        }
      `,
			'shadowed.tsrx',
			PROD,
		).code;
		expect(hoistCount(code)).toBe(0);
	});

	it('declines a callback containing a hook call', () => {
		// A hook's slot is keyed to its authored call site and module scope has no
		// render scope to run in, so the callback must not move.
		const code = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        import { useShallow } from 'octane';
        export function App(props) @{
          const a = useSelector(props.store, () => useShallow(1));
          <p>{a as string}</p>
        }
      `,
			'hook-inside.tsrx',
			PROD,
		).code;
		expect(hoistCount(code)).toBe(0);
	});

	it('declines a callback that renders JSX or reads `this`', () => {
		const jsx = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        export function App(props) @{
          const el = useSelector(props.store, () => <span>{'hi'}</span>);
          <div>{el}</div>
        }
      `,
			'jsx-inside.tsrx',
			PROD,
		).code;
		expect(hoistCount(jsx)).toBe(0);

		const thisArg = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        export function App(props) @{
          const a = useSelector(props.store, function () { return this; });
          <p>{a as string}</p>
        }
      `,
			'this-inside.tsrx',
			PROD,
		).code;
		expect(hoistCount(thisArg)).toBe(0);
	});

	it('leaves hooks whose contract is the callback itself alone', () => {
		// `useCallback` RETURNS the argument and promises a fresh identity when
		// deps change; `useMemo`/`useEffect` are defined by how often the callback
		// runs. Lifting those would change observable behavior, not just an
		// address — and the inline hook-memo tier already owns them.
		const code = compile(
			`
        import { useCallback, useEffect, useMemo, useState } from 'octane';
        export function App(props) @{
          const [n, setN] = useState(0);
          const cb = useCallback(() => globalThis.ping(), [props.depKey]);
          const memo = useMemo(() => globalThis.compute(), [props.depKey]);
          useEffect(() => globalThis.side(), []);
          <button onClick={cb}>{memo + '/' + n}</button>
        }
      `,
			'identity-owning.tsrx',
			PROD,
		).code;
		expect(hoistCount(code)).toBe(0);
	});

	it('lifts the data callbacks of useSyncExternalStore', () => {
		// `subscribe`/`getSnapshot` are values the hook reads, not identity it
		// publishes, so a stable pair avoids needless resubscription.
		const code = compile(
			`
        import { useSyncExternalStore } from 'octane';
        export function App(props) @{
          const v = useSyncExternalStore(() => globalThis.sub(), () => globalThis.snap());
          <p>{v as string}</p>
        }
      `,
			'uses.tsrx',
			PROD,
		).code;
		expect(hoistCount(code)).toBe(2);
	});

	it('sees the locals of every component declared by one statement', () => {
		// `const A = …, B = …` declares two components in a single statement. A
		// bound-name set built from only the first would miss `props` in the
		// second and lift a callback that reads it.
		const code = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        export const First = (props) => {
          return useSelector(props.store, (s) => s.a);
        }, Second = (opts) => {
          return useSelector(opts.store, (s) => s.items[opts.id]);
        };
      `,
			'multi-declarator.tsrx',
			PROD,
		).code;
		// Only the genuinely capture-free selector in `First` may be lifted.
		expect(hoistCount(code)).toBe(1);
		expect(code).toContain('opts.id');
	});

	it('treats a loop that assigns an existing binding as a write to it', () => {
		// `for (acc of …)` with no declaration ASSIGNS the enclosing `acc` rather
		// than introducing one. Reading it as a fresh loop binding hid the
		// reference, so a callback that mutates component state looked
		// capture-free — and at module scope the write has no binding to land on.
		const written = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        export function App(props) @{
          let acc;
          const total = useSelector(props.store, (s) => {
            let seen = 0;
            for (acc of s.items) { seen++; }
            return seen;
          });
          <p>{total as string}</p>
        }
      `,
			'loop-assign.tsrx',
			PROD,
		).code;
		expect(hoistCount(written)).toBe(0);

		// Same for `for-in`, and for a destructuring assignment target.
		const forIn = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        export function App(props) @{
          let key;
          const total = useSelector(props.store, (s) => {
            let seen = 0;
            for (key in s.map) { seen++; }
            return seen;
          });
          <p>{total as string}</p>
        }
      `,
			'loop-assign-in.tsrx',
			PROD,
		).code;
		expect(hoistCount(forIn)).toBe(0);
	});

	it('treats a destructuring default in a loop declaration as a capture', () => {
		// The loop's own `x` is a real binding, but the default initialiser beside
		// it is an expression that reads the component.
		const code = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        export function App(props) @{
          const first = useSelector(props.store, (s) => {
            for (const [x = props.seed] of s.pairs) return x;
            return 0;
          });
          <p>{first as string}</p>
        }
      `,
			'loop-decl-default.tsrx',
			PROD,
		).code;
		expect(hoistCount(code)).toBe(0);
		expect(code).toContain('props.seed');
	});

	it('lifts a callback whose only extra names are its own loop counters', () => {
		// A classic `for (let i = 0; …)` declares `i` in the loop's `init` rather
		// than its `left`. Reading that as a free variable made any callback
		// containing a counting loop look like it captured an enclosing binding.
		const code = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        export function App(props) @{
          const total = useSelector(props.store, (s) => {
            let sum = 0;
            for (let i = 0; i < s.items.length; i++) sum += s.items[i];
            return sum;
          });
          <p>{total as string}</p>
        }
      `,
			'loop-counter.tsrx',
			PROD,
		).code;
		expect(hoistCount(code)).toBe(1);
	});

	it('treats a parameter default that reads the component as a capture', () => {
		// A default initialiser is an expression evaluated on every call, so it can
		// read anything the callback closes over. Lifting one that reads `props`
		// would leave that name unresolvable at module scope.
		const code = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        export function App(props) @{
          const a = useSelector(props.store, (s, scale = props.factor) => s.a * scale);
          <p>{a as string}</p>
        }
      `,
			'param-default.tsrx',
			PROD,
		).code;
		expect(hoistCount(code)).toBe(0);
		expect(selectorArgs(code)[0]).toContain('props.factor');
	});

	it('treats a computed destructuring key that reads the component as a capture', () => {
		const code = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        export function App(props) @{
          const a = useSelector(props.store, ({ [props.field]: picked }) => picked);
          <p>{a as string}</p>
        }
      `,
			'computed-key.tsrx',
			PROD,
		).code;
		expect(hoistCount(code)).toBe(0);
		expect(selectorArgs(code)[0]).toContain('props.field');
	});

	it('keeps the authored form in dev and profile compiles, not just HMR', () => {
		// The lift is production-only, on the same gate as the neighbouring
		// inline hook-memo tier: a lifted callback has left the component, which
		// dev tooling and profile attribution both reason about.
		const source = `
      import { useSelector } from '@octanejs/tanstack-store';
      export function App(props) @{
        const total = useSelector(props.store, (s) => s.total);
        <p>{total as string}</p>
      }
    `;
		expect(hoistCount(compile(source, 'dev-build.tsrx', { hmr: false, dev: true }).code)).toBe(0);
		expect(
			hoistCount(compile(source, 'profile.tsrx', { hmr: false, dev: false, profile: true }).code),
		).toBe(0);
	});

	it('keeps the authored form in dev/HMR compiles', () => {
		// Identity stability is a production optimization; an HMR edit should not
		// have to reason about which closures left the component.
		const code = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        export function App(props) @{
          const total = useSelector(props.store, (s) => s.total);
          <p>{total as string}</p>
        }
      `,
			'dev.tsrx',
			DEV,
		).code;
		expect(hoistCount(code)).toBe(0);
	});
});
