import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { slotHooks } from '../src/compiler/slot-hooks.js';

const c = (source: string, options?: { mode?: 'client' | 'server' }): string =>
	compile(source, 'auto-deps.tsrx', options).code;

describe('automatic hook dependencies — full compiler', () => {
	it('infers precise member paths and omits known-stable hook results', () => {
		const code = c(`
      import {
        useState, useReducer, useRef, useEffectEvent, useTransition, useEffect
      } from 'octane';
      export function App(props) @{
        const [count, setCount, getCount] = useState(0);
        const [, dispatch] = useReducer((s, a) => s + a, 0);
        const ref = useRef(null);
        const event = useEffectEvent(() => props.onEvent(count));
        const [, startTransition] = useTransition();
        useEffect(() => {
          props.onValue(props.value, count);
          console.log(setCount, getCount, dispatch, ref.current, event, startTransition);
        });
        <div>{count as string}</div>
      }
    `);

		expect(code).toMatch(
			/useEffect\([\s\S]*?,\s*\[props\.onValue, props\.value, count\],\s*\d+\s*\)/,
		);
	});

	it('covers the complete dependency-hook family', () => {
		const code = c(`
      import {
        useEffect, useLayoutEffect, useInsertionEffect,
        useMemo, useCallback, useImperativeHandle
      } from 'octane';
      export function App(props) @{
        useEffect(() => props.passive(props.value));
        useLayoutEffect(() => props.layout(props.value));
        useInsertionEffect(() => props.insert(props.value));
        const memo = useMemo(() => props.value * 2);
        const callback = useCallback((event) => props.onEvent(event, props.value));
        useImperativeHandle(props.handle, () => ({ callback, memo }));
        <div>{memo as string}</div>
      }
    `);

		expect(code).toMatch(/useEffect\([^;]+\[props\.passive, props\.value\]/);
		expect(code).toMatch(/useLayoutEffect\([^;]+\[props\.layout, props\.value\]/);
		expect(code).toMatch(/useInsertionEffect\([^;]+\[props\.insert, props\.value\]/);
		expect(code).toMatch(/useMemo\([^;]+\[props\.value\]/);
		expect(code).toMatch(/useCallback\([^;]+\[props\.onEvent, props\.value\]/);
		expect(code).toMatch(/useImperativeHandle\([^;]+\[callback, memo\]/);
	});

	it('tracks captures through nested lexical scopes without including callback locals', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        const outer = props.outer;
        if (props.enabled) {
          const local = props.local;
          useEffect(() => {
            const inside = local;
            function nested(suffix = outer) { return inside + suffix; }
            props.log(nested());
          });
        }
        <div />
      }
    `);

		expect(code).toMatch(/useEffect\([\s\S]*?,\s*\[local, outer, props\.log\],\s*\d+\s*\)/);
	});

	it('tracks lexical bindings declared directly in switch cases', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        switch (props.kind) {
          case 'selected':
            const selected = props.value;
            useEffect(() => props.log(selected));
            break;
          default:
            break;
        }
        <div />
      }
    `);

		expect(code).toMatch(/useEffect\([^;]+\[props\.log, selected\]/);
	});

	it('tracks one-level receivers for deep reads and method calls', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        useEffect(() => {
          console.log(props.user.name);
          props.order.push(props.value);
        });
        <div />
      }
    `);

		expect(code).toMatch(
			/useEffect\([\s\S]*?,\s*\[props\.user, props\.order, props\.value\],\s*\d+\s*\)/,
		);
	});

	it('does not treat simple assignment targets as value reads', () => {
		const code = c(`
      import { useEffect, useRef } from 'octane';
      export function App(props) @{
        const ref = useRef(null);
        useEffect(() => {
          ref.current = props.value;
          props.box.current = props.other;
          props.box[props.key] = props.dynamic;
          props.total += props.delta;
        });
        <div />
      }
    `);

		expect(code).toMatch(
			/useEffect\([\s\S]*?,\s*\[\s*props\.value,\s*props\.box,\s*props\.other,\s*props\.key,\s*props\.dynamic,\s*props\.total,\s*props\.delta\s*\],\s*\d+\s*\)/,
		);
		expect(code).not.toMatch(/\[\s*ref\.current/);
	});

	it('tracks mutable module bindings while omitting imports', () => {
		const code = c(`
      import { useEffect } from 'octane';
      import { importedValue } from './config';
      let moduleValue = 0;
      const moduleObject = { value: 1 };
      export function App(props) @{
        useEffect(() => {
          props.log(importedValue, moduleValue, moduleObject.value);
        });
        <div />
      }
    `);

		expect(code).toMatch(
			/useEffect\([\s\S]*?,\s*\[props\.log, moduleValue, moduleObject\.value\],\s*\d+\s*\)/,
		);
	});

	it('emits valid chain expressions for deep optional reads', () => {
		const code = c(`
      import { useMemo } from 'octane';
      export function App(props) @{
        const name = useMemo(() => props?.user?.name);
        <div>{name as string}</div>
      }
    `);

		expect(code).toMatch(/useMemo\(\(\) => props\?\.user\?\.name, \[props\?\.user\], \d+\)/);
	});

	it('infers [] for capture-free callbacks and honors every explicit second argument', () => {
		const code = c(`
      import { useEffect, useMemo, useCallback } from 'octane';
      export function App(props) @{
        useEffect(() => console.log('once'));
        useEffect(() => console.log(props.a), []);
        useEffect(() => console.log(props.b), [props.b]);
        useEffect(() => console.log(props.c), null);
        const a = useMemo(() => 1);
        const b = useCallback(() => 2);
        <div>{a as string}</div>
      }
    `);

		expect(code).toMatch(/useEffect\(\(\) => console\.log\('once'\), \[], \d+\)/);
		expect(code).toMatch(/useEffect\(\(\) => console\.log\(props\.a\), \[], \d+\)/);
		expect(code).toMatch(/useEffect\(\(\) => console\.log\(props\.b\), \[props\.b\], \d+\)/);
		expect(code).toMatch(/useEffect\(\(\) => console\.log\(props\.c\), null, \d+\)/);
		expect(code).toMatch(/useMemo\(\(\) => 1, \[], \d+\)/);
		expect(code).toMatch(/useCallback\(\(\) => 2, \[], \d+\)/);
	});

	it('uses a referenced callback identity and rejects opaque callback creation', () => {
		const referenced = c(`
      import { useEffect, useRef } from 'octane';
      export function App(props) @{
		const ref = useRef(props.onCommit);
		useEffect(props?.api?.run);
		useEffect(ref.current);
        <div />
      }
    `);
		expect(referenced).toMatch(/useEffect\(props\?\.api\?\.run, \[props\?\.api\?\.run\], \d+\)/);
		expect(referenced).toMatch(/useEffect\(ref\.current, \[ref\.current\], \d+\)/);

		for (const callback of [
			'props.makeEffect()',
			'props.makeEffect?.()',
			'props.makeEffect().run',
		]) {
			expect(() =>
				c(`
        import { useEffect } from 'octane';
        export function App(props) @{
					useEffect(${callback});
          <div />
        }
      `),
			).toThrow(/Cannot infer dependencies.*explicit dependency array.*`null`/);
		}
	});

	it('applies the same inference during server compilation', () => {
		const code = c(
			`
        import { useMemo } from 'octane';
        export function App(props) @{
          const value = useMemo(() => props.value * 2);
          <div>{value as string}</div>
        }
      `,
			{ mode: 'server' },
		);
		expect(code).toMatch(/useMemo\(\(\) => props\.value \* 2, \[props\.value\], \d+\)/);
	});

	it('applies local custom-hook inference during server compilation', () => {
		const code = c(
			`
        import { useMemo } from 'octane';
        function useComputed(factory, dependencies) {
          return useMemo(factory, dependencies);
        }
        export function App(props) @{
          const value = useComputed(() => props.value * 2);
          <div>{value as string}</div>
        }
      `,
			{ mode: 'server' },
		);
		expect(code).toContain('() => props.value * 2, [props.value]');
	});

	it('infers dependencies for namespace imports without crossing lexical shadows', () => {
		const code = c(`
      import * as Octane from 'octane';
      export function App(props) @{
        Octane.useEffect(() => console.log(props.value));
        {
          const Octane = { useEffect(callback) { callback(); } };
          Octane.useEffect(() => console.log(props.shadowed));
        }
        <div />
      }
    `);
		expect(code).toMatch(
			/Octane\.useEffect\(\(\) => console\.log\(props\.value\), \[props\.value\], \d+\)/,
		);
		expect(code).not.toContain('[props.shadowed]');
	});

	it('does not infer dependencies for a lexically bound built-in lookalike', () => {
		const code = c(`
      import { useEffect as effect } from 'octane';
      function useEffect(callback, options) {
        return Array.isArray(options) ? 'unexpected dependencies' : callback();
      }
      export function App(props) @{
        const value = useEffect(() => props.value);
        effect(() => props.observe(value), []);
        <div>{value as string}</div>
      }
    `);

		expect(code).not.toContain('() => props.value, [props.value]');
	});

	it('infers only statically proven local custom dependency hooks', () => {
		const code = c(`
			import { useEffect as effect, useImperativeHandle, useMemo as baseMemo } from 'octane';
      function useOuter(callback, dependencies) {
        useInner(callback, dependencies);
      }
      function useInner(callback, dependencies) {
        effect(callback, dependencies);
      }
      const useArrowEffect = (callback, dependencies) => effect(callback, dependencies);
      function useHandle(ref, create, dependencies) {
        useImperativeHandle(ref, create, dependencies);
      }
      function useSelector(selector) {
        return selector({ value: 'selected' });
      }
      function runEffect(callback, dependencies) {
        return callback(dependencies);
      }
      function useFakeEffect(callback, dependencies) {
        runEffect(callback, dependencies);
      }
		function useTransformedEffect(callback, dependencies) {
			effect(callback, dependencies ?? []);
		}
		function useWrappedBuiltin(callback, dependencies) {
			effect!(callback, dependencies);
		}
		function useReassigned(callback, dependencies) {
			effect(callback, dependencies);
			useReassigned = runEffect;
		}
		function useMemo(factory, dependencies) {
			return baseMemo(factory, dependencies);
		}
      export function App(props) @{
        useOuter(() => props.log(props.value));
        useOuter(() => props.log(props.always), null);
        useOuter(() => props.log(props.explicit), [props.explicit]);
        useOuter(() => props.log(props.undefined), undefined);
        useArrowEffect(() => props.log(props.arrow));
        useHandle(props.ref, () => ({ value: props.value }));
        useFakeEffect(() => props.log(props.fake));
			useTransformedEffect(() => props.log(props.transformed));
			useWrappedBuiltin(() => props.log(props.wrapped));
			useReassigned(() => props.log(props.reassigned));
			const sameName = useMemo(() => props.sameName);
        useSelector((state) => state.value);
			<div>{sameName as string}</div>
      }
    `);

		expect(code).toMatch(
			/useOuter, \(\) => props\.log\(props\.value\), \[props\.log, props\.value\]/,
		);
		expect(code).toContain('useOuter, () => props.log(props.always), null');
		expect(code).toContain('useOuter, () => props.log(props.explicit), [props.explicit]');
		expect(code).toContain('useOuter, () => props.log(props.undefined), undefined');
		expect(code).toContain(
			'useArrowEffect, () => props.log(props.arrow), [props.log, props.arrow]',
		);
		expect(code).toMatch(
			/useHandle, props\.ref, \(\) => \(\{ value: props\.value \}\), \[props\.value\]/,
		);
		expect(code).not.toContain('props.fake), [');
		expect(code).not.toContain('props.transformed), [');
		expect(code).not.toContain('props.wrapped), [');
		expect(code).not.toContain('props.reassigned), [');
		expect(code).toContain('useMemo, () => props.sameName, [props.sameName]');
		expect(code).not.toContain('state.value, [');
	});
});

describe('automatic hook dependencies — plain TS surgical transform', () => {
	it('infers dependencies while preserving TypeScript source text', () => {
		const source = `
import { useEffect as effect, useRef } from 'octane';
export function useThing<T>(value: T) {
  const ref = useRef<T | null>(null);
  effect(() => console.log(value, ref.current));
}
`;
		const code = slotHooks(source, 'use-thing.ts')!.code;
		expect(code).toMatch(
			/effect\(\(\) => console\.log\(value, ref\.current\), \[value\], _h\$\d+\)/,
		);
		expect(code).toContain('useRef<T | null>(null, _h$');
	});

	it('preserves source ranges for module values and optional chains', () => {
		const source = `
import { useMemo as memo } from 'octane';
import { importedValue } from './config';
let moduleValue = 0;
export function useThing<T extends { deep?: { name?: string } }>(value: T) {
  return memo(() => [importedValue, moduleValue, value?.deep?.name]);
}
`;
		const code = slotHooks(source, 'use-thing.ts')!.code;
		expect(code).toMatch(
			/memo\(\(\) => \[importedValue, moduleValue, value\?\.deep\?\.name\], \[moduleValue, value\?\.deep\], _h\$\d+\)/,
		);
	});

	it('preserves complete referenced callback paths', () => {
		const source = `
import { useEffect as effect } from 'octane';
export function useThing(props: { api?: { run?: () => void } }) {
  effect(props?.api?.run);
}
`;
		const code = slotHooks(source, 'use-thing.ts')!.code;
		expect(code).toMatch(/effect\(props\?\.api\?\.run, \[props\?\.api\?\.run\], _h\$\d+\)/);
	});

	it('infers and slots namespace-imported hooks', () => {
		const source = `
import * as Octane from 'octane';
export function useThing(value: string) {
  Octane.useEffect(() => console.log(value));
  return Octane.useMemo(() => value + '!');
}
`;
		const code = slotHooks(source, 'namespace-hooks.ts')!.code;
		expect(code).toMatch(/Octane\.useEffect\([^;]+, \[value\], _h\$\d+\)/);
		expect(code).toMatch(/Octane\.useMemo\([^;]+, \[value\], _h\$\d+\)/);
	});

	it('leaves local custom dependency calls unchanged without a custom-call slot boundary', () => {
		const source = `
import { useMemo } from 'octane';
function useComputed(factory, dependencies) {
  return useMemo(factory, dependencies);
}
export function usePair(props) {
  const first = useComputed(() => 'A' + props.value);
  const second = useComputed(() => 'B' + props.value);
  return [first, second];
}
`;
		const code = slotHooks(source, 'custom-dependencies.ts')!.code;
		expect(code).toContain("useComputed(() => 'A' + props.value)");
		expect(code).toContain("useComputed(() => 'B' + props.value)");
		expect(code).not.toContain('[props.value]');
	});

	it('does not infer or slot a lexically shadowed Octane namespace', () => {
		const source = `
import * as Octane from 'octane';
export function run(value: string) {
  const Octane = { useEffect(callback: () => void) { callback(); } };
  Octane.useEffect(() => console.log(value));
}
`;
		expect(slotHooks(source, 'shadowed-namespace.ts')).toBeNull();
	});

	it('keeps the self-identifying Symbol ABI for runtime-variable spread arity', () => {
		const source = `
import { useState } from 'octane';
export function useThing(args: [] | [number]) {
  return useState(...args);
}
`;
		const code = slotHooks(source, 'spread-hook.ts')!.code;
		expect(code).toMatch(/(?:useState|_\$__useStateWithGetter)\(\.\.\.args, _h\$0\)/);
		expect(code).toContain('const _h$0 = /* @__PURE__ */ Symbol(_hs$);');
	});
});
