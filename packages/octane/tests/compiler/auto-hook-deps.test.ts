import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { slotHooks } from '../../src/compiler/slot-hooks.js';

// This file's contract is the INFERENCE — the dependency argument the
// compiler attaches to the emitted hook call. Compile with the inline
// hook-memo tier's diagnostic escape hatch so production output keeps the
// runtime-call form these source-level assertions inspect (the tier's own
// routing and semantics are covered by inline-hook-memo*.test.ts).
const c = (source: string, options?: { mode?: 'client' | 'server' }): string =>
	compile(source, 'auto-deps.tsrx', { inlineHookMemo: false, ...options }).code;

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
			/useEffect\([\s\S]*?,\s*\[_\$__methodDep\(props, "onValue"\), props\.value, count\],\s*\d+\s*\)/,
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

		expect(code).toMatch(/useEffect\([^;]+\[_\$__methodDep\(props, "passive"\), props\.value\]/);
		expect(code).toMatch(
			/useLayoutEffect\([^;]+\[_\$__methodDep\(props, "layout"\), props\.value\]/,
		);
		expect(code).toMatch(
			/useInsertionEffect\([^;]+\[_\$__methodDep\(props, "insert"\), props\.value\]/,
		);
		expect(code).toMatch(/useMemo\([^;]+\[props\.value\]/);
		expect(code).toMatch(/useCallback\([^;]+\[_\$__methodDep\(props, "onEvent"\), props\.value\]/);
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

		expect(code).toMatch(
			/useEffect\([\s\S]*?,\s*\[local, outer, _\$__methodDep\(props, "log"\)\],\s*\d+\s*\)/,
		);
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

		expect(code).toMatch(/useEffect\([^;]+\[_\$__methodDep\(props, "log"\), selected\]/);
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

	it('routes one-level method-call receivers through the own-property discriminator', () => {
		const code = c(`
      import { useMemo, useState } from 'octane';
      export function App(props) @{
        const [count, setCount] = useState(0);
        const fixed = useMemo(() => count.toFixed(2));
        const optional = useMemo(() => count?.toFixed?.(2));
        const guarded = useMemo(() => count.toFixed?.(2));
        <button onClick={() => setCount(count + 0.25)}>{fixed as string}</button>
      }
    `);

		// The method value alone can never witness a changed receiver
		// (`Number.prototype.toFixed` is one shared function), so the inferred
		// dependency defers the receiver-vs-member choice to the runtime helper.
		expect(code).toMatch(/useMemo\([^;]+\[[\w$]+\(count, ["']toFixed["']\)\],\s*\d+\s*\)/);
		expect(code).not.toMatch(/\[count\.toFixed\]/);
		expect(code).not.toMatch(/\[count\?\.toFixed\]/);
		// Every optional spelling funnels into the same null-safe helper form.
		expect(code.match(/\(count, ["']toFixed["']\)/g)).toHaveLength(3);
	});

	it('keeps computed and deep method calls on their existing receiver deps', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        useEffect(() => {
          props.handlers[props.kind](props.payload);
          console.log(props.value.toFixed(2));
        });
        <div />
      }
    `);

		// A computed callee already tracks receiver and key; a deep callee already
		// tracks its receiver path. Neither needs the helper.
		expect(code).toMatch(
			/useEffect\([\s\S]*?,\s*\[props\.handlers, props\.kind, props\.payload, props\.value\],\s*\d+\s*\)/,
		);
	});

	it('emits the method-call helper during server compilation', () => {
		const code = c(
			`
        import { useMemo, useState } from 'octane';
        export function App(props) @{
          const [count, setCount] = useState(0);
          const fixed = useMemo(() => count.toFixed(2));
          <button onClick={() => setCount(count + 0.25)}>{fixed as string}</button>
        }
      `,
			{ mode: 'server' },
		);
		expect(code).toMatch(/\[[\w$]+\(count, ["']toFixed["']\)\]/);
		expect(code).toMatch(/import \{[^}]*__methodDep[^}]*\} from ['"]octane\/server['"]/);
	});

	it('tracks only root captures inside opaque-execution directive closures', () => {
		// The TypeGPU shape from issue #542: `.$` is only legal inside shader
		// code, so a `'use gpu'` closure contributes its root bindings and the
		// dependency array performs no property read on them at render time.
		const code = c(`
      import { useMemo, useState } from 'octane';
      import { fullScreenTriangle } from './common';
      export function App(props) @{
        const [tick] = useState(0);
        const timeUniform = useMemo(() => props.root.createUniform(tick));
        const pipeline = useMemo(() => {
          return props.root.createRenderPipeline({
            vertex: fullScreenTriangle,
            fragment: () => {
              'use gpu';
              return timeUniform.$ + props.scale.factor;
            },
          });
        });
        <div>{tick as string}</div>
      }
    `);

		// props.root from the (render-time) method call; roots only from the
		// shader closure — timeUniform without .$, props without .scale.factor.
		expect(code).toMatch(/\[props\.root, timeUniform, props\],\s*\d+\s*\)/);
	});

	it('applies the same opaque-closure rule to the worklet directive', () => {
		const code = c(`
      import { useEffect } from 'octane';
      export function App(props) @{
        useEffect(() => {
          props.schedule(() => {
            'worklet';
            props.shared.value = props.shared.value + 1;
          });
        });
        <div />
      }
    `);

		expect(code).toMatch(/\[_\$__methodDep\(props, "schedule"\), props\],\s*\d+\s*\)/);
	});

	it('does not truncate closures with same-context or unknown directives', () => {
		const code = c(`
      import { useMemo } from 'octane';
      export function App(props) @{
        const strict = useMemo(() => {
          const pick = () => {
            'use strict';
            return props.name;
          };
          return pick();
        });
        const hinted = useMemo(() => {
          const pick = () => {
            'use no memo';
            return props.email;
          };
          return pick();
        });
        const unknown = useMemo(() => {
          const pick = () => {
            'use whatever';
            return props.id;
          };
          return pick();
        });
        <div>{strict as string}{hinted as string}{unknown as string}</div>
      }
    `);

		// Member paths survive: only allowlisted directives mark another
		// execution context. A truncating regression would emit [props] here.
		expect(code).toMatch(/\[props\.name\],\s*\d+\s*\)/);
		expect(code).toMatch(/\[props\.email\],\s*\d+\s*\)/);
		expect(code).toMatch(/\[props\.id\],\s*\d+\s*\)/);
	});

	it('compiles method-call deps inside custom hooks for the server print', () => {
		// The shape that first tripped OCTANE_COMPILE_ASSERT_LOC (set for every
		// vitest compile): a method call inside a hook callback of a module-level
		// custom hook, whose print does not pass through the component body's
		// deep origin inheritance — every synthesized dependency node must carry
		// its own authored origin.
		const code = c(
			`
        import { useLayoutEffect } from 'octane';
        export function useReport(context, id) {
          useLayoutEffect(() => {
            context.report(id);
          });
        }
        export function App(props) @{
          useReport(props.context, props.id);
          <div />
        }
      `,
			{ mode: 'server' },
		);
		expect(code).toMatch(/\(context, ["']report["']\), id\]/);
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

	it('tracks mutable module bindings while omitting immutable ones', () => {
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

		// `let` is the only one of the three a later statement can rebind, so it is
		// the only one a dependency array can witness. An import and a module-scope
		// `const` are both fixed for the program's lifetime — see
		// auto-hook-deps-stability.test.ts for that contract in full.
		expect(code).toMatch(
			/useEffect\([\s\S]*?,\s*\[_\$__methodDep\(props, "log"\), moduleValue\],\s*\d+\s*\)/,
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
			/useOuter, \(\) => props\.log\(props\.value\), \[_\$__methodDep\(props, "log"\), props\.value\]/,
		);
		expect(code).toContain('useOuter, () => props.log(props.always), null');
		expect(code).toContain('useOuter, () => props.log(props.explicit), [props.explicit]');
		expect(code).toContain('useOuter, () => props.log(props.undefined), undefined');
		expect(code).toContain(
			'useArrowEffect, () => props.log(props.arrow), [_$__methodDep(props, "log"), props.arrow]',
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

	it('routes one-level method-call receivers through the imported helper', () => {
		const source = `
import { useMemo } from 'octane';
export function useFixed(count: number) {
  return useMemo(() => count.toFixed(2));
}
`;
		const code = slotHooks(source, 'use-fixed.ts')!.code;
		expect(code).toMatch(
			/useMemo\(\(\) => count\.toFixed\(2\), \[[\w$]+\(count, ["']toFixed["']\)\], _h\$\d+\)/,
		);
		expect(code).toMatch(/import \{[^}]*__methodDep[^}]*\} from ['"]octane['"]/);
	});

	it('tracks roots only for worklet closures in plain TypeScript', () => {
		const source = `
import { useEffect } from 'octane';
export function useWorklet(shared: { value: number }, schedule: (fn: () => void) => void) {
  useEffect(() => {
    schedule(() => {
      'worklet';
      shared.value = shared.value + 1;
    });
  });
}
`;
		const code = slotHooks(source, 'use-worklet.ts')!.code;
		expect(code).toMatch(/, \[schedule, shared\], _h\$\d+\)/);
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

	it('uses a Symbol call path for runtime-variable state spread arity', () => {
		const source = `
import { useState } from 'octane';
export function useThing(args: [] | [number]) {
  return useState(...args);
}
`;
		const code = slotHooks(source, 'spread-hook.ts')!.code;
		expect(code).toMatch(/_\$withSlot\(_h\$0, (?:useState|_\$__useStateWithGetter), \.\.\.args\)/);
		expect(code).toContain('const _h$0 = /* @__PURE__ */ Symbol(_hs$);');
	});
});
