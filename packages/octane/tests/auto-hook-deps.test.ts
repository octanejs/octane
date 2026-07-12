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
			/useEffect\([\s\S]*?,\s*\[props\.onValue, props\.value, count\],\s*_h\$\d+\s*\)/,
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

		expect(code).toMatch(/useEffect\([\s\S]*?,\s*\[local, outer, props\.log\],\s*_h\$\d+\s*\)/);
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
			/useEffect\([\s\S]*?,\s*\[props\.user, props\.order, props\.value\],\s*_h\$\d+\s*\)/,
		);
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
			/useEffect\([\s\S]*?,\s*\[props\.log, moduleValue, moduleObject\.value\],\s*_h\$\d+\s*\)/,
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

		expect(code).toMatch(/useMemo\(\(\) => props\?\.user\?\.name, \[props\?\.user\], _h\$\d+\)/);
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

		expect(code).toMatch(/useEffect\(\(\) => console\.log\('once'\), \[], _h\$\d+\)/);
		expect(code).toMatch(/useEffect\(\(\) => console\.log\(props\.a\), \[], _h\$\d+\)/);
		expect(code).toMatch(/useEffect\(\(\) => console\.log\(props\.b\), \[props\.b\], _h\$\d+\)/);
		expect(code).toMatch(/useEffect\(\(\) => console\.log\(props\.c\), null, _h\$\d+\)/);
		expect(code).toMatch(/useMemo\(\(\) => 1, \[], _h\$\d+\)/);
		expect(code).toMatch(/useCallback\(\(\) => 2, \[], _h\$\d+\)/);
	});

	it('uses a referenced callback identity and rejects opaque callback creation', () => {
		const referenced = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
		useEffect(props?.onCommit);
        <div />
      }
    `);
		expect(referenced).toMatch(/useEffect\(props\?\.onCommit, \[props\?\.onCommit\], _h\$\d+\)/);

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
		expect(code).toMatch(/useMemo\(\(\) => props\.value \* 2, \[props\.value\], _h\$\d+\)/);
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
});
