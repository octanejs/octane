import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
// CLIENT-compiled (normal .tsrx import). Importing Widget (it has an onClick)
// registers click delegation at module load.
import { Widget } from './_fixtures/server-withslot.tsrx';

// BLOCKER 1 — `octane/server` must export `withSlot` + `startTransition` so a
// SERVER build of a `.tsrx` that defines/uses a custom hook (lowered through
// `withSlot`) and calls `startTransition` (the exact shape the router bindings
// emit) can resolve all its `octane/server` imports and SSR.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/server-withslot.tsrx',
);

// Build the SERVER module by binding its `import { … } from 'octane/server'`
// against the REAL ServerRT namespace — so a missing export (withSlot /
// startTransition) would surface as an undefined binding at call time.
function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'server-withslot.tsrx', { mode: 'server' });
	// Capture the import name list so we can assert every name resolves on ServerRT.
	const importLine = code.match(/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/);
	const names = importLine![1].split(',').map((s) => s.trim());
	for (const n of names) {
		if ((ServerRT as any)[n] === undefined) {
			throw new Error(`octane/server is missing the compiler-emitted import: ${n}`);
		}
	}
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		'const {$1} = __rt;',
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

describe('octane/server — withSlot + startTransition (BLOCKER 1)', () => {
	it('exports withSlot and startTransition', () => {
		expect(typeof (ServerRT as any).withSlot).toBe('function');
		expect(typeof (ServerRT as any).startTransition).toBe('function');
	});

	it('withSlot invokes the wrapped hook (dropping the call-site symbol)', () => {
		let seen: any[] | null = null;
		const out = (ServerRT as any).withSlot(
			Symbol('site'),
			(...args: any[]) => {
				seen = args;
				return 'ok';
			},
			'a',
			'b',
		);
		expect(out).toBe('ok');
		expect(seen).toEqual(['a', 'b']);
	});

	it('startTransition runs the callback synchronously', () => {
		let ran = false;
		(ServerRT as any).startTransition(() => {
			ran = true;
		});
		expect(ran).toBe(true);
	});

	it('server-compiles + SSRs a .tsrx using a custom hook and startTransition', async () => {
		const server = serverModule(); // throws if any octane/server import is missing
		const { html } = await ServerRT.renderToString(server.Widget, { start: 5 });
		// The custom hook's useState returned its initial; rendered through withSlot.
		expect(html).toBe('<button id="w">count:5</button>');
	});

	it('hydrates the SSR output and the transition setter is interactive', async () => {
		const server = serverModule();
		const { html } = await ServerRT.renderToString(server.Widget, { start: 0 });
		container.innerHTML = html;
		const btn = container.querySelector('#w') as HTMLButtonElement;

		const root = hydrateRoot(container, Widget, { start: 0 });
		flushSync(() => {});
		expect(container.querySelector('#w')).toBe(btn); // adopted, not rebuilt
		expect(btn.textContent).toBe('count:0');

		// The onClick calls startTransition(() => setN(n+1)) — the client transition
		// path schedules the re-render; flushing applies it.
		flushSync(() => btn.click());
		expect(btn.textContent).toBe('count:1');
		root.unmount();
	});
});
