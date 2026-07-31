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
		expect(code).toMatch(/Object\.is\(/);
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
		expect(dev).toMatch(/useMemo\(\(\) => fetchUser/);
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
