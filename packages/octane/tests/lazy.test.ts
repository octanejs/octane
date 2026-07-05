import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount, act } from './_helpers';
import { lazy } from '../src/index.js';
import { compile } from 'octane/compiler';
import * as Server from 'octane/server';
import { prerender } from 'octane/static';
import { Greeting, Counter, LazyHost, LazyUpdateHost } from './_fixtures/lazy.tsrx';

// React's lazy(load) — code-splitting. The wrapper suspends into the nearest
// boundary until load()'s promise settles, then renders the loaded component.

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('lazy — client', () => {
	it('does not call load() until the component first renders', async () => {
		const d = deferred<{ default: any }>();
		const load = vi.fn(() => d.promise);
		const L = lazy(load);
		expect(load).not.toHaveBeenCalled();

		const r = mount(LazyHost, { comp: L, name: 'ada' });
		expect(load).toHaveBeenCalledTimes(1);
		r.unmount();
	});

	it('suspends into the @pending fallback, then reveals the loaded component', async () => {
		const d = deferred<{ default: any }>();
		const L = lazy(() => d.promise);
		const r = mount(LazyHost, { comp: L, name: 'ada' });
		expect(r.find('.fallback').textContent).toBe('loading');
		expect(r.findAll('.loaded')).toHaveLength(0);

		await act(() => {
			d.resolve({ default: Greeting });
		});
		expect(r.findAll('.fallback')).toHaveLength(0);
		expect(r.find('.loaded').textContent).toBe('hello ada');
		r.unmount();
	});

	it('loads once per lazy(): a second mount after resolve renders with no fallback', async () => {
		const d = deferred<{ default: any }>();
		const load = vi.fn(() => d.promise);
		const L = lazy(load);

		const r1 = mount(LazyHost, { comp: L, name: 'one' });
		await act(() => {
			d.resolve({ default: Greeting });
		});
		expect(r1.find('.loaded').textContent).toBe('hello one');
		r1.unmount();

		const r2 = mount(LazyHost, { comp: L, name: 'two' });
		expect(r2.findAll('.fallback')).toHaveLength(0);
		expect(r2.find('.loaded').textContent).toBe('hello two');
		expect(load).toHaveBeenCalledTimes(1);
		r2.unmount();
	});

	it('routes a rejected load to @catch', async () => {
		const d = deferred<{ default: any }>();
		const L = lazy(() => d.promise);
		const r = mount(LazyHost, { comp: L });
		expect(r.find('.fallback').textContent).toBe('loading');

		await act(() => {
			d.reject(new Error('chunk failed'));
		});
		expect(r.find('.error').textContent).toBe('caught: chunk failed');
		r.unmount();
	});

	it('rejects with a helpful error when the module has no component', async () => {
		const d = deferred<any>();
		const L = lazy(() => d.promise);
		const r = mount(LazyHost, { comp: L });

		await act(() => {
			d.resolve({ default: 42 });
		});
		expect(r.find('.error').textContent).toContain('caught: lazy: expected');
		r.unmount();
	});

	it('accepts a bare component function (no { default } wrapper)', async () => {
		const d = deferred<any>();
		const L = lazy(() => d.promise);
		const r = mount(LazyHost, { comp: L, name: 'bare' });

		await act(() => {
			d.resolve(Greeting);
		});
		expect(r.find('.loaded').textContent).toBe('hello bare');
		r.unmount();
	});

	it('the loaded component keeps hook state across parent re-renders (no remount)', async () => {
		const d = deferred<{ default: any }>();
		const L = lazy(() => d.promise);
		const r = mount(LazyUpdateHost, { comp: L });
		expect(r.find('.fallback').textContent).toBe('loading');

		await act(() => {
			d.resolve({ default: Counter });
		});
		expect(r.find('.counter').textContent).toBe('n:0 p:0');

		r.click('.counter');
		expect(r.find('.counter').textContent).toBe('n:1 p:0');

		// A parent re-render updates the prop through the (stable) lazy wrapper —
		// the loaded component must patch in place, keeping its useState.
		r.click('#bump');
		expect(r.find('.counter').textContent).toBe('n:1 p:1');
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// SSR — lazy under renderToString (sync pass → fallback) and prerender
// (await-everything → loaded content).
// ---------------------------------------------------------------------------

const FIXTURES = join(process.cwd(), 'packages/octane/tests/_fixtures');

function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(Server, {});
}

const m = evalServer(readFileSync(join(FIXTURES, 'lazy.tsrx'), 'utf8'), 'lazy.tsrx');

describe('lazy — SSR', () => {
	it('renderToString renders the @pending fallback for a still-loading lazy', async () => {
		const L = Server.lazy(() => new Promise(() => {}));
		const r = await Server.renderToString(m.LazyHost, { comp: L, name: 'ada' });
		expect(r.html).toContain('loading');
		expect(r.html).not.toContain('hello');
	});

	it('prerender awaits the module and renders the loaded component', async () => {
		const L = Server.lazy(() => Promise.resolve({ default: m.Greeting }));
		const r = await prerender(m.LazyHost, { comp: L, name: 'ada' });
		expect(r.html).toContain('hello ada');
		expect(r.html).not.toContain('loading');
	});

	it('renderToString renders synchronously once the module is already loaded', async () => {
		const L = Server.lazy(() => Promise.resolve({ default: m.Greeting }));
		await prerender(m.LazyHost, { comp: L, name: 'warm' }); // load + settle the payload
		const r = await Server.renderToString(m.LazyHost, { comp: L, name: 'ada' });
		expect(r.html).toContain('hello ada');
		expect(r.html).not.toContain('loading');
	});

	it('prerender routes a rejected load to @catch', async () => {
		const L = Server.lazy(() => Promise.reject(new Error('chunk failed')));
		const r = await prerender(m.LazyHost, { comp: L });
		expect(r.html).toContain('caught: chunk failed');
	});
});
