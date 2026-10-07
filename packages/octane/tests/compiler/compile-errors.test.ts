import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';

// Compile-error coverage: pin the maintained rejection messages so future
// parser/compiler edits can't silently drop a guard. Each test asserts
// both the throw and a recognizable regex on the message — the regex is
// the user-facing contract, not the throw itself.

describe('compile errors — rejected authoring patterns', () => {
	it.each(['client', 'server'] as const)('accepts literal less-than text in %s output', (mode) => {
		const source = `export function Text() @{ <p><3 and 1 < 2 and <= 3</p> }`;
		expect(compile(source, 'text.tsrx', { mode }).diagnostics).toEqual([]);
	});

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

	it.each([
		['async', 'export default async function () @{ <div>{1}</div> }', /declared `async`/],
		['generator', 'export default function* () @{ <div>{1}</div> }', /declared as a generator/],
	])('names an anonymous %s default component by its export', (_kind, src, message) => {
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(src, 'anonymous-default.tsrx', { mode })).toThrow(message);
			expect(() => compile(src, 'anonymous-default.tsrx', { mode })).toThrow(
				/^Component `default` /,
			);
		}
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

	it.each(['client', 'server'] as const)(
		'rejects an @for row key that reads a declaration from the loop body (%s)',
		(mode) => {
			// Row keys are computed before the body runs; this key would otherwise
			// hoist into a key function where `label` does not exist.
			const src = `
      export function L(props) @{
        const label = 'outer';
        <ul>
          @for (const x of props.items) {
            const label = x.first + ' ' + x.last;
            <li key={label}>{label as string}</li>
          }
        </ul>
      }
    `;
			expect(() => compile(src, 'body-local-key.tsrx', { mode })).toThrow(
				/`key` attribute on this `@for` row reads `label`, which is declared inside the loop body/,
			);
			expect(() => compile(src, 'body-local-key.tsrx', { mode })).toThrow(/; key …\)/);
		},
	);

	// Every declaration the row function sees is out of the key's reach, not
	// only a top-level `const`, `let`, or `function`.
	it.each([
		['a class declaration', 'class K { static id = 1 }', 'K.id', 'K'],
		['a `var` hoisted out of a nested block', 'if (row.ok) { var k = row.id; }', 'k', 'k'],
		['an enum declaration', 'enum E { A }', 'E.A', 'E'],
		['a `const` after an array hole', 'const k = row.id;', '[, k].join()', 'k'],
	])('rejects an @for row key that reads %s from the loop body', (_, setup, key, name) => {
		const src = `export function R(props) @{ <ul>@for (const row of props.rows) { ${setup} <li key={${key}}>x</li> }</ul> }`;
		const message =
			`The \`key\` attribute on this \`@for\` row reads \`${name}\`, which is declared inside the ` +
			'loop body. Row keys are computed before the body runs, so they can only read the item, ' +
			'its `index` binding, and names from outside the loop. Derive the key from the item in ' +
			`the loop header instead: \`@for (const item of items; key …)\`. (r.tsrx:1:${src.indexOf('key=')})`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(src, 'r.tsrx', { mode, dev: false, hmr: false })).toThrow(message);
		}
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

	it('rejects a hook inside JSX values nested in a plain loop', () => {
		// JSX used as a value inside a plain JS loop still repeats each hook's
		// compiler-assigned call-site slot on every iteration. Keep the values
		// consumed by the final output so target-neutral unused-output validation
		// does not preempt the loop-specific diagnostic this test protects.
		const ifSrc = `
      import { useMemo } from 'octane';
      export function C(props) @{
        const output = [];
        for (let i = 0; i < props.n; i++) {
          if (props.flag) {
            output.push(<div>{useMemo(() => i, [i])}</div>);
          }
        }
        <div>{output}</div>
      }
    `;
		expect(() => compile(ifSrc, 'if-jsx-loop.tsrx')).toThrow(/`useMemo`.*`for` loop/);
		expect(() => compile(ifSrc, 'if-jsx-loop.tsrx', { mode: 'server' })).toThrow(/`for` loop/);
		const forOfSrc = `
      import { useState } from 'octane';
      export function C(props) @{
        const output = [];
        for (let i = 0; i < props.n; i++) {
          for (const x of props.items) {
            output.push(<li>{useState(0)[0] + ''}</li>);
          }
        }
        <div>{output}</div>
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

// Textarea content is RCDATA: the parser keeps markup inside it as literal
// text, so an element or template directive there cannot mean what it says.
describe('compile errors — textarea children', () => {
	it.each([
		['an element', '<textarea><b>x</b></textarea>', /contains `<b>`/],
		['a component', '<textarea>{"a"}<Field /></textarea>', /contains an element/],
		['document metadata', '<div><textarea><title>x</title></textarea></div>', /contains `<title>`/],
		['an @if block', '<textarea>@if (props.on) {\n{"a"}\n}</textarea>', /contains an `@if` block/],
		['a JSX expression', '<textarea>{props.on ? <b /> : "x"}</textarea>', /a JSX expression/],
		[
			'a mapped JSX list',
			'<textarea>{props.items.map((item) => <i key={item}>{item}</i>)}</textarea>',
			/contains an `@for` block or a mapped JSX list/,
		],
	])('rejects %s inside a textarea on both emit paths', (_label, markup, detail) => {
		const src = `function Field() @{ <input /> }\nexport function T(props: any) @{\n\t${markup}\n}\n`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(src, 'textarea.tsrx', { mode })).toThrow(
				/`<textarea>` children must be text/,
			);
			expect(() => compile(src, 'textarea.tsrx', { mode })).toThrow(detail);
		}
	});

	it('allows text and markup children of an SVG-namespace textarea', () => {
		const src = `export function T(props: any) @{
			<div>
				<textarea>hello {props.a}{props.b as string}</textarea>
				<svg><textarea><b>x</b></textarea></svg>
			</div>
		}`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(src, 'textarea.tsrx', { mode })).not.toThrow();
		}
	});
});

// A directive arm's output is its final node, so it can end early only with
// `return;`, `return null;`, or (in an `@for` body) `continue;`. A value return
// has nothing to render in the node's place, and a `break` that targets the
// directive has no loop to leave in the compiled arm. Every emit path shares
// this contract, including the universal compiler, whose arms are closures.
describe('compile errors — directive arm exits', () => {
	const component = (markup: string) =>
		`export function Arm({ x, items }: { x: number; items: string[] }) @{\n\t<div>${markup}</div>\n}\n`;
	const object = { id: 'object', module: 'octane/universal', target: 'universal', text: 'host' };
	// Each emit path compiles a source; its diagnostics end with the location in this form.
	const paths = [
		[
			'client',
			(src: string) => compile(src, 'arm-exit.tsrx', { mode: 'client' }),
			'(arm-exit.tsrx:',
		],
		[
			'server',
			(src: string) => compile(src, 'arm-exit.tsrx', { mode: 'server' }),
			'(arm-exit.tsrx:',
		],
		[
			'universal',
			(src: string) => compile(src, 'arm-exit.object.tsrx', { hmr: false, renderer: object }),
			' at arm-exit.object.tsrx:',
		],
	] as const;

	it.each([
		['a returned element', '@if (x > 0) { if (x > 1) return <i />; <b /> }'],
		['a returned string', '@if (x > 0) { <b /> } @else { if (x < -1) return "none"; <i /> }'],
		[
			'a value returned from a nested loop',
			'@for (const item of items; key item) { for (const c of item) { if (c === "a") return c; } <b /> }',
		],
		[
			'an explicit `undefined`',
			'@switch (x) { @case 1: { if (x > 0) { return undefined; } <b /> } }',
		],
	])('rejects %s in an arm on every emit path, at the return', (_label, markup) => {
		// The markup sits on line 2 after `\t<div>`; columns are zero-based.
		const at = `2:${'\t<div>'.length + markup.indexOf('return')}`;
		for (const [path, run, prefix] of paths) {
			const compileArm = () => run(component(markup));
			expect(compileArm, path).toThrow(/can only end early with `return;` or `return null;`/);
			expect(compileArm, path).toThrow(prefix + at);
		}
	});

	it.each([
		['an `@for` body', '@for (const item of items; key item) { if (item === "") break; <b /> }'],
		['an `@switch` case', '@switch (x) { @case 1: { if (x > 0) break; <b /> } }'],
		[
			'an `@if` arm inside an `@for`',
			'@for (const item of items; key item) { @if (x > 0) { { break; } <b /> } }',
		],
	])('rejects a `break` that targets the directive around %s', (_label, markup) => {
		const at = `2:${'\t<div>'.length + markup.indexOf('break')}`;
		for (const [path, run, prefix] of paths) {
			const compileArm = () => run(component(markup));
			expect(compileArm, path).toThrow(
				/`break` cannot leave the `@for` or `@switch` around a directive arm/,
			);
			expect(compileArm, path).toThrow(prefix + at);
		}
	});

	it('allows value returns outside arms and jumps that the arm setup owns', () => {
		const src = `export function Arm({ x }: { x: number }) @{
			if (x < 0) return <i />;
			<div>
				@if (x > 0) {
					const pick = () => {
						return x > 1 ? 'b' : 'a';
					};
					for (const c of [pick()]) {
						if (c === 'a') break;
					}
					block: {
						if (x > 2) break block;
					}
					<b>{pick()}</b>
				}
			</div>
		}`;
		for (const [path, run] of paths) {
			expect(() => run(src), path).not.toThrow();
		}
	});

	// A `@{ … }` block is a nested template, not an arm, so no jump ends it early
	// (the parser rejects `return` there). Every target compiles the block apart
	// from the loop or switch around it, so before this diagnostic each shape
	// emitted a module that failed to load.
	it.each([
		[
			'a `continue` in a child block of an `@for` row',
			'@for (const item of items; key item) { <p>@{ if (item === "a") continue; <b>{item}</b> }</p> }',
			'continue',
		],
		[
			'a `continue` in a block that is an `@for` body output',
			'@for (const item of items; key item) { @{ if (item === "a") continue; <b>{item}</b> } }',
			'continue',
		],
		[
			'a `break` in a child block of an `@for` row',
			'@for (const item of items; key item) { <p>@{ if (item === "a") break; <b /> }</p> }',
			'break',
		],
		[
			'a `break` in a child block of an `@switch` case',
			'@switch (x) { @case 1: { <p>@{ if (x > 0) break; <b /> }</p> } }',
			'break',
		],
		[
			'a `continue` inside a `switch` in a block',
			'@for (const item of items; key item) { <p>@{ switch (item) { case "a": continue; } <b /> }</p> }',
			'continue',
		],
		[
			'a `continue` in a code-only block',
			'@for (const item of items; key item) { <p>@{ if (item === "a") continue; console.log(item); }</p> }',
			'continue',
		],
		[
			'a `continue` in a block nested in a block',
			'@for (const item of items; key item) { <p>@{ const n = item.length; <i>@{ if (n > 1) continue; <b /> }</i> }</p> }',
			'continue',
		],
		[
			'a `continue` that targets a plain loop around the block',
			'@if (x > 0) { for (const item of items) { <p>@{ if (item === "a") continue; <b /> }</p> } <i /> }',
			'continue',
		],
		[
			'a labeled `break` that targets a label around the block',
			'@if (x > 0) { outer: { <p>@{ if (x > 1) break outer; <b /> }</p> } <i /> }',
			'break',
		],
	])('rejects %s on every emit path, at the jump', (_label, markup, jump) => {
		const col = '\t<div>'.length + markup.indexOf(jump);
		for (const [path, run] of paths) {
			const file = path === 'universal' ? 'arm-exit.object.tsrx' : 'arm-exit.tsrx';
			const compileBlock = () => run(component(markup));
			expect(compileBlock, path).toThrow(/`break` and `continue` cannot leave a `@\{ … \}` block/);
			expect(compileBlock, path).toThrow(`(${file}:2:${col})`);
		}
	});

	it('rejects a jump that leaves a block under returned JSX on every emit path', () => {
		const src = `export function Arm({ items }: { items: string[] }) {
	return <div>@for (const item of items; key item) { <p>@{ if (item === "a") continue; <b /> }</p> }</div>;
}
`;
		for (const [path, run] of paths) {
			expect(() => run(src), path).toThrow(/cannot leave a `@\{ … \}` block/);
		}
	});

	// The parser also accepts a labeled jump from an arm to a label in the setup
	// around it, which the compiled arm has no statement for.
	it.each([
		[
			'a labeled `break` to a label around an `@if` arm',
			'@if (x > 0) { outer: { <p>@if (x > 1) { if (x > 2) break outer; <b /> }</p> } <i /> }',
		],
		[
			'a labeled `continue` to a loop around an `@if` arm',
			'@for (const item of items; key item) { outer: for (const c of item) { <p>@if (c !== "") { if (c === "a") continue outer; <b /> }</p> } <i /> }',
		],
	])('rejects %s on every emit path, at the jump', (_label, markup) => {
		const col = '\t<div>'.length + markup.search(/(?:break|continue) outer/);
		for (const [path, run] of paths) {
			const file = path === 'universal' ? 'arm-exit.object.tsrx' : 'arm-exit.tsrx';
			const compileArm = () => run(component(markup));
			expect(compileArm, path).toThrow(
				/A labeled `break` or `continue` cannot leave a directive arm/,
			);
			expect(compileArm, path).toThrow(`(${file}:2:${col})`);
		}
	});

	it('allows jumps that a block owns, and an exit from an arm inside a block', () => {
		const src = `export function Arm({ items }: { items: string[] }) @{
			<ul>
				@for (const item of items; key item) {
					<li>
						@{
							let seen = 0;
							outer: for (const c of item) {
								for (const d of item) {
									if (d === c) continue outer;
								}
								if (c === 'y') continue;
								if (c === 'z') break;
								seen++;
							}
							switch (seen) {
								case 0:
									break;
							}
							check: {
								if (seen > 1) break check;
							}
							const visit = () => {
								for (const c of item) if (c === 'a') return c;
							};
							@if (item !== '') {
								if (item === visit()) continue;
								<b>{seen}</b>
							}
						}
					</li>
				}
			</ul>
		}`;
		for (const [path, run] of paths) {
			expect(() => run(src), path).not.toThrow();
		}
	});
});

// The universal compiler compiles every module-scope function, but the
// synchronous-body restriction belongs to component shapes only: a helper that
// JSX never mounts stays an ordinary function and may be async or a generator.
describe('compile errors — universal async/generator functions', () => {
	const object = {
		id: 'object',
		module: 'octane/universal',
		target: 'universal',
		text: 'host',
	} as const;
	const universal = (src: string) =>
		compile(src, 'async-helper.object.tsrx', { hmr: false, renderer: object });

	it('compiles module-scope async and generator helpers that JSX never mounts', () => {
		expect(() =>
			universal(`
				async function load(url: string) {
					return (await fetch(url)).text();
				}
				const cached = async () => 'hit';
				function* ids() {
					yield 1;
				}
				export function Screen() @{
					<view onTap={() => load('/x')} />
				}
			`),
		).not.toThrow();
	});

	it('compiles an async helper nested in component setup', () => {
		expect(() =>
			universal(`
				export function Screen() @{
					const load = async () => 'hit';
					<view onTap={() => load()} />
				}
			`),
		).not.toThrow();
	});

	it.each([
		['an async `@{ }` component', 'export async function Screen() @{ <view /> }'],
		['a generator `@{ }` component', 'export function* Screen() @{ <view /> }'],
		[
			'an async function with a JSX return',
			'async function Row() { return <view />; }\nexport function Screen() @{ <view /> }',
		],
		[
			'an async function mounted in JSX',
			'async function Loader() { return null; }\nexport function Screen() @{ <Loader /> }',
		],
		[
			'a default-exported async function',
			'export default async function Screen() { return null; }',
		],
		['an async arrow with a JSX body', 'export const Screen = async () => <view />'],
	])('still rejects %s', (_label, src) => {
		expect(() => universal(src)).toThrow(
			/async\/generator component functions are not supported yet\./,
		);
	});
});

// `@for` lowers to a keyed row list over an iterable. The parser also accepts a
// `for…in` header and a C-style header. No target can lower either, and
// lowering `for…in` as `for…of` would render an object's values (or nothing)
// instead of its keys, so every target rejects them at the directive.
describe('compile errors — @for headers', () => {
	const component = (markup: string) =>
		`export function List({ o, n, items }: { o: Record<string, string>; n: number; items: string[] }) @{\n\t<view>${markup}</view>\n}\n`;
	const object = {
		id: 'object',
		module: 'octane/universal',
		target: 'universal',
		text: 'host',
	} as const;
	const valdi = {
		id: 'native',
		module: '@test/valdi-writer',
		target: 'valdi',
		server: 'unsupported',
		text: 'reject',
	} as const;
	type Path = [path: string, run: (src: string) => ReturnType<typeof compile>];
	const paths: Path[] = [
		...[true, false].flatMap((dev): Path[] => [
			[`client dev=${dev}`, (src) => compile(src, 'For.tsrx', { mode: 'client', dev })],
			[`server dev=${dev}`, (src) => compile(src, 'For.tsrx', { mode: 'server', dev })],
			[
				`universal dev=${dev}`,
				(src) => compile(src, 'For.object.tsrx', { hmr: false, renderer: object, dev }),
			],
		]),
		['valdi', (src) => compile(src, 'For.tsrx', { hmr: false, renderer: valdi })],
	];
	const FOR_IN = /a `for…in` header is not supported/;
	const FOR_STATEMENT = /a C-style `\(init; test; update\)` header is not supported/;

	it.each([
		['a `for…in` header', '@for (const name in o) { <label value={name} /> }', FOR_IN],
		[
			'a `for…in` header with `@empty`',
			'@for (const name in o) { <label value={name} /> } @empty { <label /> }',
			FOR_IN,
		],
		[
			'a C-style header',
			'@for (let i = 0; i < n; i++) { <label value={String(i)} /> }',
			FOR_STATEMENT,
		],
		['an empty C-style header', '@for (;;) { <label /> }', FOR_STATEMENT],
		[
			'a `for…in` header nested in an `@for` row',
			'@for (const item of items; key item) { <view>@for (const name in o) { <label value={name} /> }</view> }',
			FOR_IN,
		],
	])('rejects %s on every emit path, at the directive', (_label, markup, message) => {
		// The markup sits on line 2 after `\t<view>`; columns are zero-based.
		const at = `:2:${'\t<view>'.length + markup.lastIndexOf('@for')})`;
		for (const [path, run] of paths) {
			const compileFor = () => run(component(markup));
			expect(compileFor, path).toThrow(message);
			expect(compileFor, path).toThrow(at);
		}
	});

	it('rejects a `for…in` header under returned JSX on every emit path', () => {
		const src = `export function List({ o }: { o: Record<string, string> }) {
	return <view>@for (const name in o) { <label value={name} /> }</view>;
}
`;
		for (const [path, run] of paths) {
			expect(() => run(src), path).toThrow(FOR_IN);
		}
	});

	it('compiles for-of headers and plain JS `for…in` and C-style loops around them', () => {
		const src = `export function List({ o, n, items }: { o: Record<string, string>; n: number; items: string[] }) @{
	const names = [];
	for (const name in o) names.push(name);
	for (let i = 0; i < n; i++) names.push(String(i));
	<view>
		@for (const item of items; key item) {
			let count = 0;
			for (const name in o) if (o[name] === item) count++;
			for (let i = 0; i < count; i++) names.push(item);
			<label value={item} />
		}
		@for (let name of names; key name) {
			<label value={name} />
		}
	</view>
}
`;
		for (const [path, run] of paths) {
			expect(run(src).diagnostics, path).toEqual([]);
		}
	});
});
