// useId determinism parity — ported from ReactDOMUseId-test.js.
//
// React guarantees that a component's useId is (a) stable across re-renders,
// (b) stable through wrapper-component indirection, (c) distinct for multiple
// useId() calls in one component, and — the headline invariant of the file —
// (d) byte-for-byte identical between the SERVER render and the CLIENT render so
// hydration lines up. Octane reproduces (a)/(b)/(c) on the client, but its
// server and client useId counters are independent module globals (the server
// resets to 0 every render(); the client counter is monotonic and never reset),
// so server == client does NOT hold once any other useId component has mounted.
// That last case is pinned as the high-value gap (it.fails).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane-ts/compiler';
import * as RT from '../../src/server/index.js';
import { mount } from '../_helpers';
import { Single, Triple, Wrapper } from '../_fixtures/useid-determinism.tsrx';

const FIXTURES = join(process.cwd(), 'packages/octane/tests/_fixtures');

// Same eval-the-server-compiled-module trick as tests/ssr.test.ts: the vite
// plugin compiles .tsrx in CLIENT mode for vitest, so to exercise the server
// runtime we compile the source in server mode here and bind its
// `octane-ts/server` import to the live runtime module.
function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane-ts\/server['"];?/g,
		'const {$1} = __rt;',
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export default (\w+);?/g, '__exports.default = $1;');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(RT, {});
}

const serverMod = evalServer(
	readFileSync(join(FIXTURES, 'useid-determinism.tsrx'), 'utf8'),
	'useid-determinism.tsrx',
);

describe('useId determinism', () => {
	// Per ReactDOMUseId-test.js:356 'local render phase updates' (re-render
	// stability) — a component's useId is stable across re-renders (the id a
	// component reads on its first render is the same one it reads on every
	// subsequent render).
	it('a single useId is stable across re-renders', () => {
		const r = mount(Single);
		const first = r.find('#single').getAttribute('data-testid');
		expect(first).toBeTruthy();
		// Drive a real re-render via state.
		r.click('#bump');
		expect(r.find('#bump').textContent).toBe('n=1');
		const second = r.find('#single').getAttribute('data-testid');
		// The text hole carries the same id too.
		expect(r.find('#single').textContent).toBe(second);
		r.unmount();
		expect(second).toBe(first);
	});

	// Per ReactDOMUseId-test.js:168 'indirections' — ids stay stable under
	// wrapper-component indirection, and the parent and child get DIFFERENT ids.
	it('ids stay stable under wrapper-component indirection and differ parent/child', () => {
		const r = mount(Wrapper);
		const outer1 = r.find('#outer').getAttribute('data-testid');
		const inner1 = r.find('#inner').getAttribute('data-testid');
		expect(outer1).toBeTruthy();
		expect(inner1).toBeTruthy();
		// Parent and child must not collide.
		expect(inner1).not.toBe(outer1);
		// Re-render and confirm both ids are unchanged.
		r.click('#bumpw');
		expect(r.find('#bumpw').textContent).toBe('n=1');
		const outer2 = r.find('#outer').getAttribute('data-testid');
		const inner2 = r.find('#inner').getAttribute('data-testid');
		r.unmount();
		expect(outer2).toBe(outer1);
		expect(inner2).toBe(inner1);
	});

	// Per ReactDOMUseId-test.js:331 'multiple ids in a single component' — three
	// useId() calls in one component yield three DISTINCT ids, each stable across
	// re-renders.
	it('multiple useId calls in one component yield distinct, stable ids', () => {
		const r = mount(Triple);
		const a1 = r.find('#a').getAttribute('data-testid');
		const b1 = r.find('#b').getAttribute('data-testid');
		const c1 = r.find('#c').getAttribute('data-testid');
		// All three distinct.
		expect(new Set([a1, b1, c1]).size).toBe(3);
		// Re-render: ids must not move.
		r.click('#bump3');
		expect(r.find('#bump3').textContent).toBe('n=1');
		const a2 = r.find('#a').getAttribute('data-testid');
		const b2 = r.find('#b').getAttribute('data-testid');
		const c2 = r.find('#c').getAttribute('data-testid');
		r.unmount();
		expect(a2).toBe(a1);
		expect(b2).toBe(b1);
		expect(c2).toBe(c1);
	});

	// Per ReactDOMUseId-test.js:127/140-146 — the WHOLE point of useId is that the
	// id produced on the server matches the id produced on the client so the two
	// trees hydrate without mismatch. We render the SAME fixture on the server via
	// render(), capture the id from the server HTML, then mount the same component
	// on the client and capture its id; the two must be byte-for-byte equal.
	//
	// GAP — ReactDOMUseId-test.js:127 (server/client id agreement). Octane's
	// server useId (runtime.server.ts:333, counter reset to 0 every render()) and
	// client useId (runtime.ts:1674, monotonic module-global _idCounter that is
	// never reset) use INDEPENDENT counters. The server id is always ':in-0:' for
	// the first useId of a render, but the client counter has already been
	// advanced by the mounts above, so the client id is some later ':in-N:' and
	// the two do not agree. Root cause: no shared/seeded id namespace between the
	// server render pass and the client hydrate pass (React threads a tree-path
	// based id prefix from Fizz into Fiber; Octane has no such handoff).
	it.fails('server-rendered useId matches client-mounted useId (byte-for-byte)', async () => {
		// Warm the client's monotonic id counter FIRST so this test is
		// self-contained — it must not depend on prior tests in the file having
		// advanced the counter. The divergence is precisely that the client
		// counter is never reset to align with the server's per-render reset, so
		// once any useId has been minted on the client the ids can no longer agree.
		const warm = mount(Triple);
		warm.unmount();

		const out = await RT.render(serverMod.Single);
		const serverId = out.body.match(/data-testid="([^"]+)"/)?.[1];

		const r = mount(Single);
		const clientId = r.find('#single').getAttribute('data-testid');
		r.unmount();

		expect(serverId).toBeTruthy();
		expect(clientId).toBe(serverId);
	});
});
