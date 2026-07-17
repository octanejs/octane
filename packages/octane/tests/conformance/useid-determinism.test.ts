// useId determinism parity — ported from ReactDOMUseId-test.js.
//
// React guarantees that a component's useId is (a) stable across re-renders,
// (b) stable through wrapper-component indirection, (c) distinct for multiple
// useId() calls in one component, and — the headline invariant of the file —
// (d) byte-for-byte identical between the SERVER render and the CLIENT render so
// hydration lines up. Octane reproduces all four with root-local counters, an
// automatic namespace for client-only roots, and an identifierPrefix shared by
// server render + hydration.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as RT from '../../src/server/index.js';
import { createRoot, hydrateRoot } from '../../src/index.js';
import { mount } from '../_helpers';
import { Single, Triple, Wrapper } from '../_fixtures/useid-determinism.tsrx';

const FIXTURES = join(process.cwd(), 'packages/octane/tests/_fixtures');

// Same eval-the-server-compiled-module trick as tests/ssr.test.ts: the vite
// plugin compiles .tsrx in CLIENT mode for vitest, so to exercise the server
// runtime we compile the source in server mode here and bind its
// `octane/server` import to the live runtime module.
function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export function (\w+)\(/g, '__exports.$1 = $1; function $1(');
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

	it('automatically namespaces sibling createRoot roots', () => {
		const a = document.createElement('div');
		const b = document.createElement('div');
		const seenA: string[] = [];
		const seenB: string[] = [];
		const rootA = createRoot(a);
		const rootB = createRoot(b);
		rootA.render(Single, { onId: (id: string) => seenA.push(id) });
		rootB.render(Single, { onId: (id: string) => seenB.push(id) });
		expect(seenA[0]).toMatch(/^:r[0-9a-z]+-in-0:$/);
		expect(seenB[0]).toMatch(/^:r[0-9a-z]+-in-0:$/);
		expect(seenA[0]).not.toBe(seenB[0]);
		rootA.unmount();
		rootB.unmount();
	});

	it('composes identifierPrefix with the automatic client-root namespace', () => {
		const a = document.createElement('div');
		const b = document.createElement('div');
		const seenA: string[] = [];
		const seenB: string[] = [];
		const rootA = createRoot(a, { identifierPrefix: 'app-' });
		const rootB = createRoot(b, { identifierPrefix: 'app-' });
		rootA.render(Single, { onId: (id: string) => seenA.push(id) });
		rootB.render(Single, { onId: (id: string) => seenB.push(id) });
		expect(seenA[0]).toMatch(/^:app-r[0-9a-z]+-in-0:$/);
		expect(seenB[0]).toMatch(/^:app-r[0-9a-z]+-in-0:$/);
		expect(seenA[0]).not.toBe(seenB[0]);
		rootA.unmount();
		rootB.unmount();
	});

	// Per ReactDOMUseId-test.js:127/140-146 — the WHOLE point of useId is that the
	// id produced on the server matches the id produced on the client so the two
	// trees hydrateRoot without mismatch. We server-render Single, place its HTML in a
	// container, then hydrateRoot the SAME component and capture the id the CLIENT
	// actually computed during the hydration render (via the fixture's onId
	// callback — reading the adopted attribute alone would just echo the server's
	// id and prove nothing). The two must be byte-for-byte equal.
	//
	it('server useId is preserved byte-for-byte after hydrateRoot()', async () => {
		// Warm a separate root first: root-local hydration state must be unaffected.
		const warm = mount(Triple);
		warm.unmount();

		const out = await RT.renderToString(serverMod.Single, undefined, {
			identifierPrefix: 'profile-',
		});
		const serverId = out.html.match(/data-testid="([^"]+)"/)?.[1];

		const container = document.createElement('div');
		container.innerHTML = out.html;
		document.body.appendChild(container);

		let clientId: string | undefined;
		const h = hydrateRoot(
			container,
			Single,
			{ onId: (id: string) => (clientId = id) },
			{ identifierPrefix: 'profile-' },
		);
		h.unmount();
		container.remove();

		expect(serverId).toBeTruthy();
		expect(serverId).toBe(':profile-in-0:');
		expect(clientId).toBe(serverId);
	});
});
