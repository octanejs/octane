import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// Free-variable analysis decides whether a hook callback may be lifted to
// module scope. When it misses a reference, the callback is lifted away from
// the binding it reads and the generated module is broken — three such misses
// have been found by hand (binding-pattern defaults and computed keys, a
// classic `for` init, and a bare `for-of` assignment target), each in a
// different syntactic position.
//
// Case-by-case regression tests only cover the positions someone thought of.
// These generate references across every binding-and-reference position the
// analysis models, wrap them in randomised nesting, and assert the safety
// property directly:
//
//   a callback that reads ANY component-scoped binding is never lifted.
//
// The converse is checked too, so the analysis cannot pass by simply refusing
// to lift anything.
//
// The lift is a production-compile decision with no runtime signature, so the
// oracle is necessarily the emitted module — the compiler-contract exception.
// It asserts only whether a lifted binding was emitted, never its name or
// layout.

const PROD = { hmr: false as const, dev: false };

/** Deterministic PRNG so a failure reproduces from the seed it prints. */
function makeRng(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

// Every form reads `outerConst` or `outerLet` — both declared by the component —
// from a different syntactic position. `s` is the callback's own parameter.
const CAPTURING_FORMS: ReadonlyArray<readonly [string, string]> = [
	['body read', '(s) => s.a + outerConst'],
	['parameter default', '(s, x = outerConst) => s.a + x'],
	['computed key in parameter pattern', '({ [outerConst]: picked }) => picked'],
	['computed key in declarator', '(s) => { const { [outerConst]: p } = s; return p; }'],
	['default in object declarator', '(s) => { const { q = outerConst } = s; return q; }'],
	['default in array declarator', '(s) => { const [a = outerConst] = s.list; return a; }'],
	['classic for init', '(s) => { for (let i = outerConst; i < 1; i++) {} return s.a; }'],
	['classic for test', '(s) => { for (let i = 0; i < outerConst; i++) {} return s.a; }'],
	['for-of iterable', '(s) => { for (const x of outerConst) return x; return 0; }'],
	['bare for-of target', '(s) => { let n = 0; for (outerLet of s.items) n++; return n; }'],
	['bare for-in target', '(s) => { let n = 0; for (outerLet in s.map) n++; return n; }'],
	[
		'destructuring default in for-of head',
		'(s) => { for (const [x = outerConst] of s.pairs) return x; return 0; }',
	],
	[
		'catch parameter default',
		'(s) => { try { return s.a; } catch ({ m = outerConst }) { return m; } }',
	],
	['nested arrow body', '(s) => s.items.map((x) => x + outerConst).length'],
	[
		'nested function parameter default',
		'(s) => { function g(y = outerConst) { return y; } return g(); }',
	],
	['object computed key', '(s) => ({ [outerConst]: s.a })[outerConst]'],
	['template literal', '(s) => `${outerConst}`.length + s.a'],
	['switch discriminant', '(s) => { switch (outerConst) { default: return s.a; } }'],
	['assignment to outer binding', '(s) => { outerLet = s.a; return outerLet; }'],
	['update expression on outer binding', '(s) => { outerLet++; return s.a; }'],
	[
		'shadowed only in a sibling scope',
		'(s) => { { const outerConst2 = 1; void outerConst2; } return s.a + outerConst; }',
	],
	['object method computed key', '(s) => ({ [outerConst]() { return s.a; } })[outerConst]()'],
	['object getter computed key', '(s) => ({ get [outerConst]() { return s.a; } })[outerConst]'],
	[
		'class method computed key',
		'(s) => { class C { [outerConst]() { return s.a; } } return new C()[outerConst](); }',
	],
	['class field initializer', '(s) => { class C { f = outerConst; } return new C().f + s.a; }'],
	[
		'class computed field key',
		'(s) => { class C { [outerConst] = 1; } return new C()[outerConst] + s.a; }',
	],
	['tagged template', '(s) => String.raw`${outerConst}`.length + s.a'],
	['sequence expression', '(s) => (outerConst, s.a)'],
	['do-while test', '(s) => { let i = 0; do { i++; } while (i < outerConst); return s.a; }'],
	[
		'labelled continue',
		'(s) => { let n = 0; outer: for (const x of s.items) { if (x === outerConst) continue outer; n++; } return n; }',
	],
	['optional call argument', '(s) => s.fn?.(outerConst)'],
	['nested pattern default', '(s) => { const { a: { b = outerConst } = {} } = s; return b; }'],
	[
		'rest then default',
		'(s) => { const { x, ...rest } = s; const { y = outerConst } = rest; return y + x; }',
	],
	['async arrow body', '(s) => { const f = async () => outerConst; void f; return s.a; }'],
	[
		'generator body',
		'(s) => { function* g() { yield outerConst; } return [...g()].length + s.a; }',
	],
	[
		'getter in class computed key',
		'(s) => { class C { get [outerConst]() { return s.a; } } return new C()[outerConst]; }',
	],
	['spread argument', '(s) => Math.max(...[outerConst], s.a)'],
	['new expression argument', '(s) => new Array(outerConst).length + s.a'],
	['ternary branch', '(s) => (s.a ? outerConst : 0)'],
	['logical rhs', '(s) => s.a || outerConst'],
	['default export of arrow inside', '(s) => { const o = { v: outerConst }; return o.v + s.a; }'],
];

// The callback reads nothing the component declares: only its own bindings,
// module scope, and globals. Each MUST stay liftable.
const SELF_CONTAINED_FORMS: ReadonlyArray<readonly [string, string]> = [
	['plain member read', '(s) => s.a'],
	['own parameter default', '(s, x = 2) => s.a + x'],
	[
		'own loop counter',
		'(s) => { let sum = 0; for (let i = 0; i < s.n; i++) sum += i; return sum; }',
	],
	['own for-of binding', '(s) => { for (const v of s.items) return v; return 0; }'],
	['own for-of assignment target', '(s) => { let acc; for (acc of s.items) {} return acc; }'],
	['module-scope computed key', '(s) => { const { [MODULE_KEY]: p } = s; return p; }'],
	['global reference', '(s) => Math.max(s.a, 0)'],
	['own catch binding', '(s) => { try { return s.a; } catch (e) { return 0; } }'],
	[
		'shadowing a component name with its own binding',
		'(s) => { const outerConst = 3; return s.a + outerConst; }',
	],
];

/**
 * Wrap a callback in randomly chosen, semantics-preserving nesting. Rest
 * parameters forward whatever signature the inner callback has, so a form with
 * a destructuring parameter nests as safely as a plain one.
 */
function nest(callback: string, rng: () => number, depth: number): string {
	let out = callback;
	for (let i = 0; i < depth; i++) {
		const pick = Math.floor(rng() * 3);
		if (pick === 0) out = `(...a) => { { return (${out})(...a); } }`;
		else if (pick === 1) out = `(...a) => { if (true) { return (${out})(...a); } return 0; }`;
		else out = `(...a) => { try { return (${out})(...a); } catch { return 0; } }`;
	}
	return out;
}

function compileWithCallback(callback: string, filename: string): string {
	return compile(
		`
      import { useSelector } from '@octanejs/tanstack-store';
      const MODULE_KEY = 'k';
      export function App(props) @{
        const outerConst = props.seed;
        let outerLet = props.seed;
        const v = useSelector(props.store, ${callback});
        <p>{(v ?? outerLet) as string}</p>
      }
    `,
		filename,
		PROD,
	).code;
}

function wasLifted(code: string): boolean {
	return /const _fn\$\d+ =/.test(code);
}

describe('free-variable analysis — lift safety', () => {
	it.each(CAPTURING_FORMS)('never lifts a callback reading the component via %s', (name, form) => {
		const code = compileWithCallback(form, 'capture.tsrx');
		expect(wasLifted(code), `lifted a callback that reads the component via ${name}`).toBe(false);
	});

	it.each(SELF_CONTAINED_FORMS)('still lifts a self-contained callback using %s', (name, form) => {
		const code = compileWithCallback(form, 'free.tsrx');
		expect(wasLifted(code), `declined a callback that captures nothing (${name})`).toBe(true);
	});

	it('never lifts a capturing callback however it is nested', () => {
		// The reference is unchanged; only the scope structure around it moves.
		// A position the analysis models correctly at depth 0 must stay correct
		// once blocks, branches, and try/catch sit between it and the callback.
		const ROUNDS = 240;
		const failures: string[] = [];
		for (let seed = 1; seed <= ROUNDS; seed++) {
			const rng = makeRng(seed);
			const [name, form] = CAPTURING_FORMS[Math.floor(rng() * CAPTURING_FORMS.length)];
			const nested = nest(form, rng, 1 + Math.floor(rng() * 3));
			let code: string;
			try {
				code = compileWithCallback(nested, `nested-${seed}.tsrx`);
			} catch (error) {
				failures.push(`seed ${seed} (${name}): compile threw — ${(error as Error).message}`);
				continue;
			}
			if (wasLifted(code)) failures.push(`seed ${seed} (${name}): lifted\n${nested}`);
		}
		expect(failures, failures.slice(0, 3).join('\n\n')).toEqual([]);
	});
});
