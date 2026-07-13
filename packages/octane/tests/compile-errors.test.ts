import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';

// Compile-error coverage: pin the maintained rejection messages so future
// parser/compiler edits can't silently drop a guard. Each test asserts
// both the throw and a recognizable regex on the message — the regex is
// the user-facing contract, not the throw itself.

describe('compile errors — rejected authoring patterns', () => {
	it('rejects multiple `ref={…}` attributes on a single element', () => {
		const src = `
      import { useRef } from 'octane';
      export function MultiRef() @{
        const a = useRef(null);
        const b = useRef(null);
        <div ref={a} ref={b}>{'two refs'}</div>
      }
    `;
		expect(() => compile(src, 'multi-ref.tsrx')).toThrow(/multiple `ref=.*?` attributes/);
		expect(() => compile(src, 'multi-ref.tsrx')).toThrow(/ref=\{\[a, b\]\}/);
	});

	it('allows a single `ref={[a, b]}` array form (canonical multi-attach)', () => {
		const src = `
      import { useRef } from 'octane';
      export function ArrayRef() @{
        const a = useRef(null);
        const b = useRef(null);
        <div ref={[a, b]}>{'array form'}</div>
      }
    `;
		expect(() => compile(src, 'array-ref.tsrx')).not.toThrow();
	});

	it('rejects an `async function` component with an actionable message', () => {
		const src = `export async function Foo() @{ <div>{1}</div> }`;
		// Without this guard an async component compiles to broken synchronous
		// code with no diagnostic — silent miscompilation is the worst failure.
		expect(() => compile(src, 'async-comp.tsrx')).toThrow(/declared `async`/);
		expect(() => compile(src, 'async-comp.tsrx')).toThrow(/use\(promise\)/);
	});

	it('rejects an `async` exported-default component', () => {
		const src = `export default async function Foo() @{ <div>{1}</div> }`;
		expect(() => compile(src, 'async-default.tsrx')).toThrow(/declared `async`/);
	});

	it('rejects a generator (`function*`) component', () => {
		const src = `export function* Gen() @{ <div>{1}</div> }`;
		expect(() => compile(src, 'gen-comp.tsrx')).toThrow(/generator/);
	});

	it('rejects `@for await (...)` (async iteration) — must fail loudly, not lower to a sync loop', () => {
		const src = `
      export function L(props) @{
        <ul>
          @for await (const x of props.items) {
            <li>{x as any}</li>
          }
        </ul>
      }
    `;
		// The TSRX parser rejects the surface syntax outright today; makeForCall
		// also guards the lowered node. Either way the contract is: it throws.
		expect(() => compile(src, 'for-await.tsrx')).toThrow();
	});

	it('rejects children on a void element (`<input>…</input>`)', () => {
		const src = `export function V() @{ <input>{'kid'}</input> }`;
		// React throws at render time (ReactDOMComponent-test.js:1794); octane's
		// templates are static so the rejection moves to compile time. Without it
		// the template parser silently DROPS the children.
		expect(() => compile(src, 'void-children.tsrx')).toThrow(/void element/);
		expect(() => compile(src, 'void-children.tsrx', { mode: 'server' })).toThrow(/void element/);
	});

	it('rejects `dangerouslySetInnerHTML` on a void element', () => {
		const src = `export function V(props) @{ <input dangerouslySetInnerHTML={{ __html: props.h }} /> }`;
		// Without this guard the htmlOnlyChild fast path writes invisible
		// `input.innerHTML` (ReactDOMComponent-test.js:1807 throws).
		expect(() => compile(src, 'void-danger.tsrx')).toThrow(/void element/);
		expect(() => compile(src, 'void-danger.tsrx', { mode: 'server' })).toThrow(/void element/);
	});

	it('accepts a childless void element (attributes, whitespace, and comments are fine)', () => {
		const src = `
      export function V(props) @{
        <div>
          <input value={props.v} />
          <br />
          <img src={props.src} />
        </div>
      }
    `;
		expect(() => compile(src, 'void-ok.tsrx')).not.toThrow();
		expect(() => compile(src, 'void-ok.tsrx', { mode: 'server' })).not.toThrow();
	});

	it('accepts a valueless `key` attribute on an element inside @for', () => {
		const src = `
      export function L(props) @{
        <ul>
          @for (const x of props.items) {
            <li key>{x as string}</li>
          }
        </ul>
      }
    `;
		// A bare `key` carries no expression — makeForCall must skip it (like
		// makeCompCall's null-value handling) and fall back to the default
		// `x.id ?? x` key, not crash dereferencing `keyAttr.value.type`.
		expect(() => compile(src, 'valueless-key.tsrx')).not.toThrow();
		expect(() => compile(src, 'valueless-key.tsrx', { mode: 'server' })).not.toThrow();
	});
});

describe('compile errors — slot-keyed hooks in plain JS loops', () => {
	// Hooks are keyed by a compiler-assigned per-call-site symbol, so every
	// iteration of a plain JS loop hits the SAME slot: useState shares one state
	// cell across iterations, useMemo thrashes (only the last iteration's entry
	// survives), effects collide — all silently. The compiler rejects the
	// pattern; the keyed `@for` template directive (per-item block scope) and
	// child-component extraction are the supported loop forms.

	it('rejects a builtin hook inside a `for` loop', () => {
		const src = `
      import { useMemo } from 'octane';
      export function C(props) @{
        const memos = [];
        for (let i = 0; i < props.n; i++) memos.push(useMemo(() => i * 10, [i]));
        <div>{memos.length + ''}</div>
      }
    `;
		expect(() => compile(src, 'hook-for.tsrx')).toThrow(/`useMemo` is called inside a `for` loop/);
		// The message must carry the fix, not just the rule.
		expect(() => compile(src, 'hook-for.tsrx')).toThrow(/keyed `@for` directive/);
		expect(() => compile(src, 'hook-for.tsrx', { mode: 'server' })).toThrow(/`for` loop/);
	});

	it('rejects useState inside `while`, useRef inside `do…while`, useId inside `for…in`', () => {
		const whileSrc = `
      import { useState } from 'octane';
      export function C(props) @{
        let i = 0;
        while (i < props.n) { const [x] = useState(0); i++; }
        <div>{'x'}</div>
      }
    `;
		expect(() => compile(whileSrc, 'hook-while.tsrx')).toThrow(/`useState`.*`while` loop/);
		const doSrc = `
      import { useRef } from 'octane';
      export function C(props) @{
        let i = 0;
        do { useRef(null); i++; } while (i < props.n);
        <div>{'x'}</div>
      }
    `;
		expect(() => compile(doSrc, 'hook-do.tsrx')).toThrow(/`useRef`.*`do…while` loop/);
		const inSrc = `
      import { useId } from 'octane';
      export function C(props) @{
        const ids = [];
        for (const k in props.obj) ids.push(useId());
        <div>{ids.length + ''}</div>
      }
    `;
		expect(() => compile(inSrc, 'hook-forin.tsrx')).toThrow(/`useId`.*`for…in` loop/);
	});

	it('rejects an aliased Octane base hook inside a plain JS loop', () => {
		const source = `
      import { useState as state } from 'octane';
      export function App(props) @{
        for (const item of props.items) state(item);
        <div />
      }
    `;
		expect(() => compile(source, 'aliased-hook-loop.tsrx')).toThrow(/`useState`.*`for…of` loop/);
	});

	it('rejects a custom hook (identifier and method form) inside a `for…of` loop', () => {
		// A custom hook repeats ONE withSlot call-site symbol per iteration → its
		// inner base hooks share one path → shared state, same failure as builtins.
		const identSrc = `
      export function C(props) @{
        const out = [];
        for (const k of props.keys) out.push(useThing(k));
        <div>{out.length + ''}</div>
      }
    `;
		expect(() => compile(identSrc, 'custom-forof.tsrx')).toThrow(/`useThing`.*`for…of` loop/);
		const methodSrc = `
      export function C(props) @{
        const out = [];
        for (const r of props.routes) out.push(r.useMatch());
        <div>{out.length + ''}</div>
      }
    `;
		expect(() => compile(methodSrc, 'method-forof.tsrx')).toThrow(/`useMatch`.*`for…of` loop/);
	});

	it('rejects a hook in a loop inside a plain custom-hook function (client compile)', () => {
		// Plain module functions get the same slotting ("hooks everywhere"), so the
		// same loop hazard applies. Server compile does not slot plain functions
		// (no cross-render hook persistence in a single SSR pass), so the guard is
		// client-side — any real build compiles the client artifact and fails.
		const src = `
      import { useState } from 'octane';
      function useMany(n) {
        const out = [];
        for (let i = 0; i < n; i++) out.push(useState(0));
        return out;
      }
      export function C(props) @{
        const s = useMany(props.n);
        <div>{s.length + ''}</div>
      }
    `;
		expect(() => compile(src, 'custom-hook-loop.tsrx')).toThrow(/`useState`.*`for` loop.*useMany/);
	});

	it('rejects a hook behind a directive-shaped statement inside a plain loop', () => {
		// A bare-JSX `if` (or a directive-shaped `for…of`) nested in a plain JS
		// loop is NOT a template position — the construct's own per-call-site slot
		// repeats each iteration exactly like a hook slot, so hooks reached through
		// it collide all the same. The walker must not treat these as template
		// directives and skip them (found by review on the initial guard).
		const ifSrc = `
      import { useMemo } from 'octane';
      export function C(props) @{
        for (let i = 0; i < props.n; i++) {
          if (props.flag) {
            <div>{useMemo(() => i, [i])}</div>
          }
        }
        <div>{'x'}</div>
      }
    `;
		expect(() => compile(ifSrc, 'if-jsx-loop.tsrx')).toThrow(/`useMemo`.*`for` loop/);
		expect(() => compile(ifSrc, 'if-jsx-loop.tsrx', { mode: 'server' })).toThrow(/`for` loop/);
		const forOfSrc = `
      import { useState } from 'octane';
      export function C(props) @{
        for (let i = 0; i < props.n; i++) {
          for (const x of props.items) {
            <li>{useState(0)[0] + ''}</li>
          }
        }
        <div>{'x'}</div>
      }
    `;
		expect(() => compile(forOfSrc, 'forof-jsx-loop.tsrx')).toThrow(/`useState`.*`for` loop/);
	});

	it('rejects a plain JS loop with a hook inside a template @for item body', () => {
		// The @for item body gets a per-item scope, but WITHIN one item render the
		// inner plain loop still repeats the hook's slot every pass.
		const src = `
      import { useState } from 'octane';
      export function C(props) @{
        <ul>
          @for (const item of props.items; key item.id) {
            const xs = [];
            for (let i = 0; i < 3; i++) xs.push(useState(0));
            <li>{xs.length + ''}</li>
          }
        </ul>
      }
    `;
		expect(() => compile(src, 'loop-in-for-item.tsrx')).toThrow(/`useState`.*`for` loop/);
		expect(() => compile(src, 'loop-in-for-item.tsrx', { mode: 'server' })).toThrow(/`for` loop/);
	});

	it('allows a template @if with a hook inside a template @for body', () => {
		const src = `
      import { useState } from 'octane';
      export function C(props) @{
        <ul>
          @for (const item of props.items; key item.id) {
            @if (item.flag) {
              <li>{useState(0)[0] + ''}</li>
            }
          }
        </ul>
      }
    `;
		expect(() => compile(src, 'if-in-for-hooks.tsrx')).not.toThrow();
		expect(() => compile(src, 'if-in-for-hooks.tsrx', { mode: 'server' })).not.toThrow();
	});

	it('rejects a hook inside a loop in a useMemo factory (runs during render)', () => {
		const src = `
      import { useMemo, useState } from 'octane';
      export function C(props) @{
        const v = useMemo(() => {
          for (let i = 0; i < 3; i++) { useState(0); }
          return 1;
        }, []);
        <div>{v + ''}</div>
      }
    `;
		expect(() => compile(src, 'memo-factory-loop.tsrx')).toThrow(/`useState`.*`for` loop/);
	});

	it('allows `useContext` and `use()` in a loop (not slot-keyed)', () => {
		// useContext is keyed by context identity; use(thenable) by per-render call
		// order (client `block.__thenableIdx`, server frame occurrence counter) —
		// each iteration genuinely gets its own entry.
		const ctxSrc = `
      import { useContext, createContext } from 'octane';
      const Ctx = createContext(1);
      export function C(props) @{
        const out = [];
        for (const k of props.keys) out.push(useContext(Ctx));
        <div>{out.length + ''}</div>
      }
    `;
		expect(() => compile(ctxSrc, 'ctx-loop.tsrx')).not.toThrow();
		expect(() => compile(ctxSrc, 'ctx-loop.tsrx', { mode: 'server' })).not.toThrow();
		const useSrc = `
      import { use } from 'octane';
      export function C(props) @{
        const out = [];
        for (const p of props.promises) out.push(use(p));
        <div>{out.length + ''}</div>
      }
    `;
		expect(() => compile(useSrc, 'use-loop.tsrx')).not.toThrow();
		expect(() => compile(useSrc, 'use-loop.tsrx', { mode: 'server' })).not.toThrow();
	});

	it('allows hooks in a keyed `@for` template body (per-item block scope)', () => {
		const src = `
      import { useState } from 'octane';
      export function C(props) @{
        <ul>
          @for (const item of props.items; key item.id) {
            const [n, setN] = useState(0);
            <li onClick={() => setN(n + 1)}>{item.label + ':' + n}</li>
          }
        </ul>
      }
    `;
		expect(() => compile(src, 'for-directive-hooks.tsrx')).not.toThrow();
		expect(() => compile(src, 'for-directive-hooks.tsrx', { mode: 'server' })).not.toThrow();
	});

	it('rejects a hook in a closure that executes during the iteration (IIFE, sync callbacks)', () => {
		// A function boundary only exempts DEFERRED bodies. An IIFE and an inline
		// callback to a synchronous array-iteration method run during the loop
		// iteration itself, so their hooks repeat the one call-site slot exactly
		// like inline calls (found by review on the initial guard).
		const iifeSrc = `
      import { useMemo } from 'octane';
      export function C(props) @{
        const out = [];
        for (let i = 0; i < props.n; i++) {
          out.push((() => useMemo(() => i, [i]))());
        }
        <div>{out.length + ''}</div>
      }
    `;
		expect(() => compile(iifeSrc, 'iife-loop.tsrx')).toThrow(/`useMemo`.*`for` loop/);
		expect(() => compile(iifeSrc, 'iife-loop.tsrx', { mode: 'server' })).toThrow(/`for` loop/);
		const mapSrc = `
      export function C(props) @{
        const out = [];
        for (const group of props.groups) {
          out.push(group.items.map((x) => useThing(x)));
        }
        <div>{out.length + ''}</div>
      }
    `;
		expect(() => compile(mapSrc, 'map-cb-loop.tsrx')).toThrow(/`useThing`.*`for…of` loop/);
		const forEachSrc = `
      import { useRef } from 'octane';
      export function C(props) @{
        for (const g of props.groups) {
          g.items.forEach(() => { useRef(null); });
        }
        <div>{'x'}</div>
      }
    `;
		expect(() => compile(forEachSrc, 'foreach-cb-loop.tsrx')).toThrow(/`useRef`.*`for…of` loop/);
	});

	it('allows a hook behind a deferred arrow inside an IIFE inside a loop', () => {
		// The IIFE body executes per iteration, but the hook sits behind a FURTHER
		// (deferred) function boundary inside it — still exempt.
		const src = `
      import { useState } from 'octane';
      export function C(props) @{
        const out = [];
        for (const k of props.keys) {
          out.push((() => { const f = () => useState(0); return f; })());
        }
        <div>{out.length + ''}</div>
      }
    `;
		expect(() => compile(src, 'iife-deferred.tsrx')).not.toThrow();
		expect(() => compile(src, 'iife-deferred.tsrx', { mode: 'server' })).not.toThrow();
	});

	it('allows hooks behind a nested function boundary inside a loop', () => {
		// A function declared in the loop may be a local component (each instance
		// renders in its own scope) or a deferred callback — not this render's
		// slot traffic, so the scan must not cross the boundary.
		const src = `
      import { useState } from 'octane';
      export function C(props) @{
        const comps = [];
        for (const k of props.keys) {
          comps.push(function Item() {
            const [n] = useState(0);
            return <li>{n + ''}</li>;
          });
        }
        <div>{comps.length + ''}</div>
      }
    `;
		expect(() => compile(src, 'nested-fn-loop.tsrx')).not.toThrow();
		expect(() => compile(src, 'nested-fn-loop.tsrx', { mode: 'server' })).not.toThrow();
	});

	it('allows a hook-free loop, including inside an effect callback', () => {
		const src = `
      import { useEffect } from 'octane';
      export function C(props) @{
        const data = [];
        for (let i = 0; i < props.n; i++) data.push(i);
        useEffect(() => {
          for (const t of props.timers) clearTimeout(t);
        }, [props.timers]);
        <div>{data.length + ''}</div>
      }
    `;
		expect(() => compile(src, 'plain-loop.tsrx')).not.toThrow();
		expect(() => compile(src, 'plain-loop.tsrx', { mode: 'server' })).not.toThrow();
	});

	it('allows a `.map()` child with a hook in the callback (lowers to keyed @for)', () => {
		const src = `
      import { useState } from 'octane';
      export function C(props) {
        return <ul>{props.items.map((item) => { const [n] = useState(0); return <li key={item.id}>{n}</li>; })}</ul>;
      }
    `;
		expect(() => compile(src, 'map-hook.tsrx')).not.toThrow();
		expect(() => compile(src, 'map-hook.tsrx', { mode: 'server' })).not.toThrow();
	});
});
