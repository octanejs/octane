import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// Source-level contracts of the inline hook-memo tier that cannot be
// distinguished behaviorally: which compile modes and authoring shapes consume
// the hook call versus keep the runtime form, and that consumed calls leave no
// dead runtime import. Semantics (recompute policy, identity, chain
// refetching) are owned by the behavioral suites in inline-hook-memo.test.ts
// and use-chain-memo.test.ts, which run under both vitest projects.

const PROD = { hmr: false as const, dev: false };

describe('inline hook-memo tier — compile-mode and shape routing', () => {
	it('consumes eligible useMemo/useCallback declarations in production output', () => {
		const code = compile(
			`
        import { useMemo, useCallback, useState } from 'octane';
        export function App({ items, q }) @{
          const [n, setN] = useState(0);
          const filtered = useMemo(() => items.filter((x) => x.includes(q)), [items, q]);
          const pick = useCallback((e) => setN(n + 1), [n]);
          <button onClick={pick}>{'len=' + filtered.length}</button>
        }
      `,
			'inline-memo.tsrx',
			PROD,
		).code;
		// No runtime hook invocation survives — the per-render factory and deps
		// array allocations are gone. Dependency compares keep Object.is
		// semantics (React parity for NaN/±0).
		expect(code).not.toMatch(/useMemo\(/);
		expect(code).not.toMatch(/useCallback\(/);
		expect(code).toMatch(/hookMemoEqual/);
		expect(code).not.toMatch(/Object\.is\(/);
	});

	it('keeps the runtime path for shapes the inline tier declines', () => {
		const code = compile(
			`
        import { useMemo, useShallow } from 'octane';
        export function App({ items, deps, q }) @{
          const viaIdentifierDeps = useMemo(() => items.slice(), deps);
          const hookInside = useMemo(() => useShallow(q), [q]);
          <p>{'x' + viaIdentifierDeps.length + hookInside}</p>
        }
      `,
			'inline-memo-ineligible.tsrx',
			PROD,
		).code;
		// Deps that aren't a literal array, and factories containing
		// hook-shaped calls, stay on the runtime hook.
		expect(code.match(/useMemo\(/g)?.length).toBe(2);
	});

	it('removes closures from expression, custom-hook return, and explicit-slot sites', () => {
		const code = compile(
			`
				import { useMemo as memoValue, useCallback } from 'octane';
				const SLOT = Symbol('authored');
				function identity(value) { return value; }
				function useReturned(value) { return memoValue(() => value + 1, [value]); }
				function useBlock(value) {
					return memoValue(() => { if (value < 0) return 0; const next = value + 1; return next; }, [value]);
				}
				export function App({ value }) @{
					const [first] = memoValue(() => [value], [value]);
					const callback = identity(useCallback(() => value, [value]));
					const explicit = memoValue(() => value + 2, [value], SLOT);
					const returned = useReturned(value);
					const block = useBlock(value);
					<p>{String(first + callback() + explicit + returned + block)}</p>
				}
			`,
			'inline-memo-shapes.tsrx',
			{ ...PROD, autoMemo: false },
		).code;
		expect(code).not.toMatch(/\b(?:memoValue|useCallback)\(/);
		// Render-local sites avoid the hooks map; callable/custom-slot sites
		// preserve their composable entry while removing the factory closure.
		expect(code).toMatch(/hookMemoPublish1/);
		expect(code).toMatch(/memoTake1/);
		expect(code).toMatch(/memoSlot\(SLOT,/);
	});

	it('removes memo closures inside returned JSX without changing its callable ABI', () => {
		const code = compile(
			`/** @jsxImportSource octane */
			import * as Octane from 'octane';
			export function App({ value }) {
				return <button onClick={Octane.useCallback(() => value, [value])}>
					{Octane.useMemo(() => value + 1, [value])}
				</button>;
			}`,
			'inline-memo-returned.tsx',
			{ ...PROD, autoMemo: false },
		).code;
		expect(code).not.toMatch(/Octane\.use(?:Memo|Callback)\(/);
		expect(code).toMatch(/export function App\(/);
		expect(code).toMatch(/memoTake1/);
	});

	it('declines factory scopes and unsafe expression hoisting independently', () => {
		for (const expression of [
			`useMemo(function named() { return arguments[0]; }, [value])`,
			`useMemo((dependency) => dependency, [value])`,
			`useMemo(async () => value, [value])`,
			`useMemo(() => { var local = value; return local; }, [value])`,
			`useMemo(() => eval('value'), [value])`,
			`String(useMemo(() => { const local = value; return local; }, [value]))`,
		]) {
			const code = compile(
				`import { useMemo } from 'octane';
				export function App({ value }) @{
					const result = ${expression};
					<p>{String(result)}</p>
				}`,
				'inline-memo-safety.tsrx',
				{ ...PROD, autoMemo: false },
			).code;
			expect(code.match(/\buseMemo\(/g)?.length, expression).toBe(1);
			expect(code, expression).not.toMatch(/\b(?:memoTake\d|hookMemoPublish\d?)\(/);
		}
	});

	it('keeps opaque function subtrees opaque while lowering an ordinary sibling', () => {
		const code = compile(
			`import { useMemo } from 'octane';
			function useOrdinary(value) { return useMemo(() => value, [value]); }
			export function App({ value }) @{
				'worklet';
				function useInner(next) { return useMemo(() => next, [next]); }
				const result = useMemo(() => value, [value]);
				<><p>{String(result)}</p><span>tail</span></>
			}`,
			'inline-memo-opaque-owner.tsrx',
			{ ...PROD, autoMemo: false },
		).code;
		expect(code.match(/\buseMemo\(/g)?.length).toBe(2);
		expect(code).toMatch(/memoTake1/);
	});

	it('keeps the diagnostic off switch on the runtime path', () => {
		const code = compile(
			`import { useMemo } from 'octane';
			function useValue(value) { return useMemo(() => value, [value]); }
			export function App({ value }) @{
				const result = useMemo(() => value + 1, [value]);
				<p>{String(result + useValue(value))}</p>
			}`,
			'inline-memo-disabled.tsrx',
			{ ...PROD, autoMemo: false, inlineHookMemo: false },
		).code;
		expect(code.match(/\buseMemo\(/g)?.length).toBe(2);
		expect(code).not.toMatch(/octane\/internal\/client/);
	});

	it('does not lend render-local cache bindings to a later class initializer', () => {
		const code = compile(
			`import { useMemo } from 'octane';
			export function App({ value, observe }) @{
				class Later {
					field = useMemo(() => value, [value]);
					useValue(next) { return useMemo(() => next, [next]); }
				}
				observe(Later);
				return null;
			}`,
			'inline-memo-class-scope.tsrx',
			{ ...PROD, autoMemo: false },
		).code;
		expect(code.match(/\buseMemo\(/g)?.length).toBe(1);
		expect(code).toMatch(/memoTake1/);
		expect(code).not.toMatch(/hookMemoPublish\d?\(/);
	});

	it('keeps the runtime path in dev/HMR compiles', () => {
		const source = `
      import { useMemo } from 'octane';
      export function App({ q }) @{
        const v = useMemo(() => q + '!', [q]);
        <p>{v}</p>
      }
    `;
		const dev = compile(source, 'inline-memo-dev.tsrx', { hmr: 'vite', dev: true }).code;
		expect(dev).toMatch(/useMemo\(/);
	});

	it('keeps universal renderer memo hooks on the renderer runtime', () => {
		const source = `
			import { useCallback, useMemo } from 'octane';
			export function Scene({ value }) @{
				const callback = useCallback(() => value, [value]);
				const memoized = useMemo(() => value + 1, [value]);
				<node value={memoized} onTap={callback} />
			}
		`;
		const renderer = {
			id: 'object',
			module: 'octane/universal',
			target: 'universal' as const,
		};
		const enabled = compile(source, 'inline-memo-universal.tsrx', {
			...PROD,
			autoMemo: false,
			inlineHookMemo: true,
			renderer,
		}).code;
		const disabled = compile(source, 'inline-memo-universal.tsrx', {
			...PROD,
			autoMemo: false,
			inlineHookMemo: false,
			renderer,
		}).code;

		expect(enabled).toBe(disabled);
		expect(enabled).toMatch(/useCallback/);
		expect(enabled).toMatch(/useMemo/);
		expect(enabled).not.toMatch(/octane\/internal\/client|memo(?:Slot|Take|Publish)/);
	});

	it('lowers parallel-use creations to the take/publish ABI with no dead import', () => {
		const code = compile(
			`
        import { use } from 'octane';
        export function App({ id }) @{
          const user = use(fetchUser(id));
          <p>{'u=' + user.name}</p>
        }
      `,
			'inline-pu.tsrx',
			PROD,
		).code;
		expect(code).toMatch(/puTake\d\(/);
		expect(code).toMatch(/puPub\(/);
		// The runtime memo form (and its import) is fully consumed…
		expect(code).not.toMatch(/_\$useMemo/);
		// …while the cold warm plan keeps its closure form.
		expect(code).toMatch(/warmMemo\(\(\) => fetchUser/);

		const dev = compile(
			`
        import { use } from 'octane';
        export function App({ id }) @{
          const user = use(fetchUser(id));
          <p>{'u=' + user.name}</p>
        }
      `,
			'inline-pu-dev.tsrx',
			{ hmr: 'vite', dev: true },
		).code;
		expect(dev).toMatch(/useMemo\(\s*\(\)\s*=>[\s\S]*?\(\)\s*=>\s*fetchUser\(id\)/);
		expect(dev).not.toMatch(/puTake/);
	});

	it('memoizes use()-fed const chains on the server mirror', () => {
		// The client side of this shape is covered behaviorally
		// (use-chain-memo.test.ts); the server mirror has no behavioral rig for
		// it, so pin the narrowest property: both links wrap in the server
		// creation cache, and the derived link keys on the upstream promise's
		// identity (not a `.then` member path, which is Promise.prototype.then
		// and identical across every promise).
		const server = compile(
			`
      import { use } from 'octane';
      export function Thumb({ id }) @{
        const userPromise = fetchUser(id);
        const thumbnailPromise = userPromise.then((user) => user.thumbnail());
        <img src={use(thumbnailPromise)} />
      }
    `,
			'chain.tsrx',
			{ ...PROD, mode: 'server' },
		).code;
		expect(server).toMatch(/puMemo\(\(\) => fetchUser\(id\)/);
		expect(server).toMatch(/puMemo\(\(\) => userPromise\.then/);
		expect(server).toMatch(/\[userPromise\]/);
	});
});
