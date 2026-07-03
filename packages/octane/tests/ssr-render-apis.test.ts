import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import * as Server from 'octane/server';
import { prerender } from 'octane/static';

// React-aligned buffered SSR entry points:
//   renderToString       — one sync pass, fallbacks for suspended boundaries, no await
//   renderToStaticMarkup — clean non-hydratable HTML (no block/head markers, no seeds)
//   prerender (octane/static) — await ALL data, success arms rendered
// All return { html, css } (head folded into html; css a separate channel).

function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		'const {$1} = __rt;',
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(Server, {});
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
	// A nested component so the block-marker range (which wraps nested-component
	// output) is present in the hydratable render and absent in static markup.
	const m = evalServer(
		`function Child() @{ <span>hi</span> }
		 export function P() @{ <div class="x"><Child /></div> }`,
		'static.tsrx',
	);

	it('emits no block markers', () => {
		const r = Server.renderToStaticMarkup(m.P);
		expect(r.html).not.toContain('<!--[-->');
		expect(r.html).not.toContain('<!--]-->');
		expect(r.html).toContain('<div class="x"><span>hi</span></div>');
	});

	it('renderToString of the same component DOES carry markers (contrast)', () => {
		expect(Server.renderToString(m.P).html).toContain('<!--[-->');
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
