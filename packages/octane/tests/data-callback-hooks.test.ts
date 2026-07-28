import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// A hook that memoizes on its callback's identity wants that identity to move
// only when the values the callback reads move. The compiler can supply that —
// it can see the captures at the call site — but it cannot see whether the HOOK
// treats its callback as data or as a dependency subject, because that fact
// lives in the hook's own package.
//
// So the hook declares it, via `dataCallbackHooks`. Getting this wrong yields a
// stale closure rather than a loud error, which is why nothing is inferred here
// and why the transform is inert until something opts in.

const PROD = { hmr: false as const, dev: false };
const DECLARED = ['@octanejs/tanstack-store#useSelector'];

const SOURCE = `
  import { useSelector } from '@octanejs/tanstack-store';
  export function App(props) @{
    const free = useSelector(props.store, (s) => s.total);
    const captured = useSelector(props.store, (s) => s.items[props.id]);
    <p>{free + '/' + captured}</p>
  }
`;

const wraps = (code: string) => [...code.matchAll(/_\$autoCb\(/g)].length;
const lifts = (code: string) => [...code.matchAll(/const _fn\$\d+ =/g)].length;

describe('data-callback hooks', () => {
	it('changes nothing until a hook declares its callback is data', () => {
		const code = compile(SOURCE, 'inert.tsrx', PROD).code;
		expect(wraps(code)).toBe(0);
		// The capture-free selector is still lifted; that decision is unrelated.
		expect(lifts(code)).toBe(1);
	});

	it('keys a capturing callback on its captures once declared', () => {
		const code = compile(SOURCE, 'declared.tsrx', {
			...PROD,
			dataCallbackHooks: DECLARED,
		}).code;
		expect(wraps(code)).toBe(1);
		// The dependency list is the member PATH actually read. A coarse `[props]`
		// would be worthless — the props object is a fresh identity every render,
		// so the memo would never hit.
		expect(code).toMatch(/\[props\.id\]/);
		// A callback that captures nothing still takes the module-scope lift,
		// which is strictly better than a per-instance memo cell.
		expect(lifts(code)).toBe(1);
	});

	it('matches the declaration against the module the hook came from', () => {
		const code = compile(SOURCE, 'other-module.tsrx', {
			...PROD,
			dataCallbackHooks: ['some-other-package#useSelector'],
		}).code;
		expect(wraps(code)).toBe(0);
	});

	it('accepts a bare name for a hook declared in the module being compiled', () => {
		const code = compile(
			`
        import { useSyncExternalStore } from 'octane';
        export function useLocalSelector(source, selector, slot?: symbol) {
          const snap = useSyncExternalStore(source.subscribe, source.get, undefined, slot);
          return selector(snap);
        }
        export function App(props) @{
          const v = useLocalSelector(props.store, (s) => s.items[props.id]);
          <p>{v as string}</p>
        }
      `,
			'local-hook.tsrx',
			{ ...PROD, dataCallbackHooks: ['useLocalSelector'] },
		).code;
		expect(wraps(code)).toBe(1);
	});

	it('leaves a declared hook alone when it takes its own dependency list', () => {
		// An explicit `null` is the author's "re-run every render" escape hatch,
		// and an explicit array means the hook already owns freshness. Memoizing
		// the callback beneath either could hand the hook a stale closure.
		const code = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        export function App(props) @{
          const a = useSelector(props.store, (s) => s.items[props.id], null);
          const b = useSelector(props.store, (s) => s.rows[props.id], [props.id]);
          <p>{a + '/' + b}</p>
        }
      `,
			'own-deps.tsrx',
			{ ...PROD, dataCallbackHooks: DECLARED },
		).code;
		expect(wraps(code)).toBe(0);
	});

	it('stays out of dev, HMR and profile compiles', () => {
		for (const mode of [
			{ hmr: false as const, dev: true },
			{ hmr: 'vite' as const, dev: true },
			{ hmr: false as const, dev: false, profile: true },
		]) {
			const code = compile(SOURCE, 'modes.tsrx', { ...mode, dataCallbackHooks: DECLARED }).code;
			expect(wraps(code)).toBe(0);
		}
	});

	it('does not treat an imported hook as module-local for a bare declaration', () => {
		// A bare entry declares a hook written in THIS module. A default or
		// namespace import from some other package must not fall through into it,
		// or a hook that never opted in gets its callbacks dep-keyed.
		const asDefault = compile(
			`
        import useSelector from 'some-other-package';
        export function App(props) @{
          const v = useSelector(props.store, (s) => s.items[props.id]);
          <p>{v as string}</p>
        }
      `,
			'default-import.tsrx',
			{ ...PROD, dataCallbackHooks: ['useSelector'] },
		).code;
		expect(wraps(asDefault)).toBe(0);

		const viaNamespace = compile(
			`
        import * as Store from 'some-other-package';
        export function App(props) @{
          const v = Store.useSelector(props.store, (s) => s.items[props.id]);
          <p>{v as string}</p>
        }
      `,
			'namespace-import.tsrx',
			{ ...PROD, dataCallbackHooks: ['useSelector'] },
		).code;
		expect(wraps(viaNamespace)).toBe(0);
	});

	it('matches a namespace-imported hook against its own module', () => {
		const code = compile(
			`
        import * as Store from '@octanejs/tanstack-store';
        export function App(props) @{
          const v = Store.useSelector(props.store, (s) => s.items[props.id]);
          <p>{v as string}</p>
        }
      `,
			'namespace-declared.tsrx',
			{ ...PROD, dataCallbackHooks: DECLARED },
		).code;
		expect(wraps(code)).toBe(1);
	});

	it('keys a callback whose call passes an explicit undefined', () => {
		// `undefined` is not a deliberate dependency list — it is what an omitted
		// optional argument looks like, and omitted is exactly when a capturing
		// callback should be keyed.
		const code = compile(
			`
        import { useSelector } from '@octanejs/tanstack-store';
        export function App(props) @{
          const v = useSelector(props.store, (s) => s.items[props.id], undefined);
          <p>{v as string}</p>
        }
      `,
			'explicit-undefined.tsrx',
			{ ...PROD, dataCallbackHooks: DECLARED },
		).code;
		expect(wraps(code)).toBe(1);
	});

	it('sees the dependency escape hatch through a type wrapper', () => {
		// `null as any` and `[dep] as const` are the same author intent as the bare
		// forms. A type wrapper hiding one is exactly the stale-closure case the
		// escape hatch exists to prevent.
		for (const deps of ['null as any', '(null)', '[props.id] as const', '[props.id]!']) {
			const code = compile(
				`
          import { useSelector } from '@octanejs/tanstack-store';
          export function App(props) @{
            const v = useSelector(props.store, (s) => s.items[props.id], ${deps});
            <p>{v as string}</p>
          }
        `,
				'ts-wrapped-deps.tsrx',
				{ ...PROD, dataCallbackHooks: DECLARED },
			).code;
			expect(wraps(code), `deps written as \`${deps}\``).toBe(0);
		}
	});
});
