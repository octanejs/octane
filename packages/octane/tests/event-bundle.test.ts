import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';

// Pin the stable event-bundle optimization: when an event handler arrow
// has the shape `onClick={() => fn(a, b, c)}` (zero params, single
// CallExpression body, no spread args), the compiler lowers it to a
// `{ fn, args }` descriptor built ONCE by an arity helper (3b of
// docs/compiled-output-optimization-plan.md) and mutated IN PLACE on
// update — dispatch reads `el[key]` per event, so the mutation is
// observed with no compare, no rebuild, and no property re-assignment.
//
// Audited path: compile.js detectStableEventBundle,
// emitBindingMount/emitBindingUpdate "event-bundle" branches. Slot shape
// (ONE bag field per binding — the descriptor):
//
//   mount:  _mI = _$evt1(el, "$$click", (callee), (arg0));
//           _b = _$bagN(__s, _root, …, _mI, …);
//   update: _$evt1u(_b.x, (callee), (arg0));

const c = (src: string): string => compile(src, 'eb.tsrx').code;

describe('event-bundle optimization — {fn, args} hoisting + identity diff', () => {
	it('zero-arg bundle: hoists callee only, no _a slot, $$ assignment uses bundle', () => {
		const code = c(`
      export function App() @{
        <button onClick={() => doSomething()}>{'go'}</button>
      }
    `);
		// Mount: arity-0 helper builds + assigns the descriptor; one bag field.
		expect(code).toMatch(/_m\d+\s*=\s*_\$evt0\(\w+,\s*"\$\$click",\s*\(doSomething\)\)/);
		// Update: in-place fn mutation, no compare, no re-assignment.
		expect(code).toMatch(/_\$evt0u\(_b\.\w+,\s*\(doSomething\)\)/);
		expect(code).not.toMatch(/!==/);
	});

	it('multi-arg bundle: per-arg slots + OR-chain identity diff on update', () => {
		const code = c(`
      export function App(props) @{
        <button onClick={() => fn(props.a, props.b, props.c)}>{'go'}</button>
      }
    `);
		// >2 args → the rest-fallback helper with an args array, still one field.
		expect(code).toMatch(
			/_m\d+\s*=\s*_\$evtN\(\w+,\s*"\$\$click",\s*\(fn\),\s*\[\(props\.a\),\s*\(props\.b\),\s*\(props\.c\)\]\)/,
		);
		// Update: in-place mutation with a fresh args array, no compare chain.
		expect(code).toMatch(
			/_\$evtNu\(_b\.\w+,\s*\(fn\),\s*\[\(props\.a\),\s*\(props\.b\),\s*\(props\.c\)\]\)/,
		);
		expect(code).not.toMatch(/!==\s*_a0/);
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
		// Row bundle: arity-1 helper with the iterated value as the arg.
		expect(code).toMatch(/_m\d+\s*=\s*_\$evt1\(\w+,\s*"\$\$click",\s*\(fn\),\s*\(item\)\)/);
		expect(code).toMatch(/_\$evt1u\(_b\.\w+,\s*\(fn\),\s*\(item\)\)/);
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
