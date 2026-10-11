import { loadCompiledFixtureSource } from './_server-fixture.js';
import { describe, it, expect, vi } from 'vitest';
import { flushSync, hydrateRoot, type Root } from 'octane';
import * as Server from 'octane/server';
import { prerender } from 'octane/static';

// React-aligned buffered SSR entry points:
//   renderToString       — one sync pass, fallbacks for suspended boundaries, no await
//   renderToStaticMarkup — clean non-hydratable HTML (no block/head markers, no seeds)
//   prerender (octane/static) — await ALL data, success arms rendered
// All return { html, css } (head folded into html; css a separate channel).

function evalServer(source: string, file: string): Record<string, any> {
	return loadCompiledFixtureSource(source, {
		id: file,
		mode: 'server',
		compileOptions: { mode: 'server' },
	});
}

describe('SSR entry — { html, css } shape', () => {
	it('renderToString returns html + css, not head/body', () => {
		const m = evalServer(
			`export function P() @{ <div class="x"><span>hi</span></div> }`,
			'shape.tsrx',
		);
		const r = Server.renderToString(m.P);
		expect(r).toHaveProperty('html');
		expect(r).toHaveProperty('css');
		expect(r).not.toHaveProperty('body');
		expect(r).not.toHaveProperty('head');
		expect(r.html).toContain('<div class="x">');
		expect(r.html).toContain('<span>hi</span>');
	});
});

describe('renderToString — synchronous, fallbacks for suspended', () => {
	const susp = evalServer(
		`import { use } from 'octane';
		 export function Slow(p) @{ const v = use(p.promise); <span class="done">{v as string}</span> }
		 export function App(p) @{
			<main>@try { <Slow promise={p.promise} /> } @pending { <p class="fb">loading</p> }</main>
		 }`,
		'sync-susp.tsrx',
	);

	it('renders the @pending fallback WITHOUT awaiting the thenable', () => {
		const never = new Promise<string>(() => {});
		const r = Server.renderToString(susp.App, { promise: never });
		expect(r.html).toContain('class="fb"');
		expect(r.html).toContain('loading');
		expect(r.html).not.toContain('class="done"');
	});

	it('keeps hydration block markers', () => {
		const r = Server.renderToString(susp.App, { promise: new Promise(() => {}) });
		expect(r.html).toContain('<!--[-->');
	});
});

describe('renderToStaticMarkup — clean, non-hydratable', () => {
	// Hydratable output promises adoption, not a particular comment layout.
	const source = `function Child() @{ <span>hi</span> }
		 export function P() @{ <div class="x"><Child /></div> }`;
	const m = evalServer(source, 'static.tsrx');

	it('emits no block markers', () => {
		const r = Server.renderToStaticMarkup(m.P);
		expect(r.html).not.toContain('<!--[-->');
		expect(r.html).not.toContain('<!--]-->');
		expect(r.html).toContain('<div class="x"><span>hi</span></div>');
	});

	it('renderToString of the same component supports adopting the server DOM', () => {
		const client = loadCompiledFixtureSource(source, {
			id: 'static.tsrx',
			mode: 'client',
			compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod', hmr: false },
		});
		const container = document.createElement('div');
		container.innerHTML = Server.renderToString(m.P).html;
		document.body.appendChild(container);
		const div = container.querySelector('.x')!;
		const span = div.querySelector('span')!;
		const text = Array.from(span.childNodes).find((node) => node.nodeType === 3)!;
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
		let root: Root | undefined;
		try {
			flushSync(() => {
				root = hydrateRoot(container, client.P);
			});
			expect(container.children).toHaveLength(1);
			expect(container.querySelector('.x')).toBe(div);
			expect(container.querySelector('span')).toBe(span);
			expect(Array.from(span.childNodes)).toContain(text);
			expect(container.textContent).toBe('hi');
			flushSync(() => root!.render(client.P));
			expect(container.children).toHaveLength(1);
			expect(container.querySelector('.x')).toBe(div);
			expect(container.querySelector('span')).toBe(span);
			expect(Array.from(span.childNodes)).toContain(text);
			expect(container.textContent).toBe('hi');
			expect(errors.mock.calls).toEqual([]);
			expect(warnings.mock.calls).toEqual([]);
		} finally {
			try {
				root?.unmount();
			} finally {
				container.remove();
				errors.mockRestore();
				warnings.mockRestore();
			}
		}
		expect(container.childNodes).toHaveLength(0);
	});
});

describe('prerender (octane/static) — awaits all data', () => {
	const m = evalServer(
		`import { use } from 'octane';
		 export function Slow(p) @{ const v = use(p.promise); <span class="done">{v as string}</span> }
		 export function App(p) @{ <main>@try { <Slow promise={p.promise} /> } @pending { <p>loading</p> }</main> }`,
		'prerender.tsrx',
	);

	it('resolves the success arm (not the fallback)', async () => {
		const r = await prerender(m.App, { promise: Promise.resolve('DATA') });
		expect(r.html).toContain('class="done"');
		expect(r.html).toContain('DATA');
		expect(r.html).not.toContain('loading');
		expect(r).toHaveProperty('css');
	});
});
