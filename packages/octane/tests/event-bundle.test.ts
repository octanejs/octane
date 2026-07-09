import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';

// Pin the stable event-bundle optimization: when an event handler arrow
// has the shape `onClick={() => fn(a, b, c)}` (zero params, single
// CallExpression body, no spread args), the compiler hoists the callee
// and each arg into per-binding slots and emits an OR-chain identity
// diff on re-render. Identical args skip the property reassignment
// entirely — load-bearing for the js-framework-benchmark swap-rows row.
//
// Audited path: compile.js detectStableEventBundle,
// emitBindingMount/emitBindingUpdate "event-bundle" branches. Slot shape
// (bag fields are compiler-assigned 1-char names; mount fills `_mN` locals
// that the bag factory receives positionally):
//
//   mount:  _mI = (callee); _mJ = (arg0); _mK = (arg1);
//           el["$$click"] = { fn: _mI, args: [_mJ, _mK] };
//           _b = _$bagN(__s, _root, …, _mI, _mJ, _mK, …);
//   update: const _fn = (callee); const _a0 = (arg0); const _a1 = (arg1);
//           if (_b.x !== _fn || _b.y !== _a0 || …) { …reassign… }

const c = (src: string): string => compile(src, 'eb.tsrx').code;

describe('event-bundle optimization — {fn, args} hoisting + identity diff', () => {
	it('zero-arg bundle: hoists callee only, no _a slot, $$ assignment uses bundle', () => {
		const code = c(`
      export function App() @{
        <button onClick={() => doSomething()}>{'go'}</button>
      }
    `);
		// Mount: fn local present, bundle with empty args.
		expect(code).toMatch(/_m\d+\s*=\s*\(doSomething\)/);
		expect(code).toMatch(/\["\$\$click"\]\s*=\s*\{\s*fn:\s*_m\d+,\s*args:\s*\[\s*\]\s*\}/);
		// Update: fn-only compare; no arg-slot churn.
		expect(code).toMatch(/const\s+_fn\s*=\s*\(doSomething\)/);
		expect(code).not.toMatch(/!==\s*_a0/);
	});

	it('multi-arg bundle: per-arg slots + OR-chain identity diff on update', () => {
		const code = c(`
      export function App(props) @{
        <button onClick={() => fn(props.a, props.b, props.c)}>{'go'}</button>
      }
    `);
		expect(code).toMatch(/_m\d+\s*=\s*\(props\.a\)/);
		expect(code).toMatch(/_m\d+\s*=\s*\(props\.b\)/);
		expect(code).toMatch(/_m\d+\s*=\s*\(props\.c\)/);
		// Bundle exposes all three args.
		expect(code).toMatch(/args:\s*\[\s*_m\d+\s*,\s*_m\d+\s*,\s*_m\d+\s*\]/);
		// Update: 4-way OR chain (fn + 3 args) against the 1-char bag fields.
		expect(code).toMatch(
			/_b\.\w+\s*!==\s*_fn\s*\|\|\s*_b\.\w+\s*!==\s*_a0\s*\|\|\s*_b\.\w+\s*!==\s*_a1\s*\|\|\s*_b\.\w+\s*!==\s*_a2/,
		);
	});

	it('per-row @for body: each row gets its own bundle capturing the iterated value', () => {
		const code = c(`
      export function App(props) @{
        <ul>
          @for (const item of props.items; key item.id) {
            <button onClick={() => fn(item)}>{item.label as string}</button>
          }
        </ul>
      }
    `);
		expect(code).toMatch(/_m\d+\s*=\s*\(item\)/);
		expect(code).toMatch(/\["\$\$click"\]\s*=\s*\{\s*fn:\s*_m\d+,\s*args:\s*\[\s*_m\d+\s*\]\s*\}/);
	});

	it('bailout: arrow with a param falls through to plain event binding', () => {
		const code = c(`
      export function App() @{
        <button onClick={(e) => fn(e)}>{'go'}</button>
      }
    `);
		expect(code).not.toMatch(/\{\s*fn:/);
		expect(code).toMatch(/\["\$\$click"\]\s*=\s*\([\s\S]*?=>/);
	});

	it('bailout: non-arrow handler reference falls through to plain event binding', () => {
		const code = c(`
      export function App(props) @{
        <button onClick={props.handler}>{'go'}</button>
      }
    `);
		expect(code).not.toMatch(/\{\s*fn:/);
		expect(code).toMatch(/\["\$\$click"\]\s*=\s*\(props\.handler\)/);
	});

	it('bailout: spread arg in body call falls through', () => {
		const code = c(`
      export function App(props) @{
        <button onClick={() => fn(...props.rest)}>{'go'}</button>
      }
    `);
		expect(code).not.toMatch(/\{\s*fn:/);
	});

	it('bailout: multi-statement block body falls through', () => {
		const code = c(`
      export function App() @{
        <button onClick={() => { a(); b(); }}>{'go'}</button>
      }
    `);
		expect(code).not.toMatch(/\{\s*fn:/);
	});

	it('bailout: non-CallExpression body (binary op) falls through', () => {
		const code = c(`
      export function App(props) @{
        <button onClick={() => props.x + 1}>{'go'}</button>
      }
    `);
		expect(code).not.toMatch(/\{\s*fn:/);
	});

	it('concise body vs block-with-return: emits the same bundle shape', () => {
		const concise = c(`
      export function App(props) @{
        <button onClick={() => fn(props.a)}>{'go'}</button>
      }
    `);
		const block = c(`
      export function App(props) @{
        <button onClick={() => { return fn(props.a); }}>{'go'}</button>
      }
    `);
		// Strip numeric slot ids so the two outputs become directly comparable.
		const norm = (s: string): string => s.replace(/\$\d+/g, '$N');
		expect(norm(concise)).toBe(norm(block));
	});

	it('member-expression callee is NOT bundled (receiver would be lost)', () => {
		// Regression: `_fn$ = (props.obj.method)` extracted the method bare, so the
		// dispatcher's `fn(...)` invocation ran it with `this === undefined`
		// (`() => props.log.push(x)` threw mid-dispatch). Member callees keep the
		// plain closure handler; only plain-identifier callees bundle.
		const code = c(`
      export function App(props) @{
        <button onClick={() => props.obj.method(props.x)}>{'go'}</button>
      }
    `);
		expect(code).not.toMatch(/\{\s*fn:/); // no bundle: the method is never extracted bare
		expect(code).toMatch(/\$\$click.*=/); // still an event handler, as a closure
	});
});
