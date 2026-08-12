// ReactDOMFloat-test.js conformance evidence (slice 2): resource-hint keying
// and attribute serialization, hint calls from render/effect timing positions,
// Float resources and hints discovered inside streamed Suspense boundaries,
// fallback hoistables, and hint no-ops against already-present resources.
//
// Cases whose upstream observable is stylesheet LOAD timing (suspensey
// commits), Fizz's rendered-<img> preload queues, or SuspenseList are
// dispositions, not ports — see the parity ledger.
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	act,
	createRoot,
	preload,
	preinit,
	preloadModule,
	preinitModule,
	resetFloatResourceState,
} from '../../src/index.js';
import * as Server from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import { createPipeableCollector, deferred } from '../_server-stream.js';
import {
	RenderAndEffectPreloads,
	EffectPreinitStyle,
	RenderPreinitStyle,
	RenderPreinitScript,
} from '../_fixtures/float-evidence-2.tsrx';

const srv = loadServerFixture('packages/octane/tests/_fixtures/float-evidence-2.tsrx') as Record<
	string,
	any
>;
const floatSrv = loadServerFixture(
	'packages/octane/tests/_fixtures/float-resources.tsrx',
) as Record<string, any>;

afterEach(() => {
	document.head
		.querySelectorAll('[data-oct-hint], [data-precedence], [data-oct-res]')
		.forEach((el) => el.remove());
	resetFloatResourceState();
});

/** Every <link rel="preload"> (or modulepreload) tag in `html` naming `ref`. */
function preloadTags(html: string, ref: string, rel = 'preload'): string[] {
	const tags = html.match(new RegExp(`<link rel="${rel}"[^>]*>`, 'g')) ?? [];
	return tags.filter((t) => t.includes(ref));
}

function stylesheetTags(html: string, ref: string): string[] {
	const tags = html.match(/<link rel="stylesheet"[^>]*>/g) ?? [];
	return tags.filter((t) => t.includes(ref));
}

async function settleMacrotasks(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('Float evidence — streamed SSR discovery and flush identity', () => {
	// Per ReactDOMFloat-test.js:3988
	it('never flushes a second preload when a rendered stylesheet resource follows a preload', async () => {
		const gate = deferred<string>();
		const App = () => {
			Server.preload('/late-sheet.css', { as: 'style' });
			return Server.createElement(srv.LateSheetBoundary, { promise: gate.promise }) as any;
		};
		const collector = createPipeableCollector();
		Server.renderToPipeableStream(App as any, {}, {}).pipe(collector.destination);
		await settleMacrotasks();
		const shell = collector.chunks.join('');
		// The shell already carries exactly one preload AND the stylesheet: the
		// per-round pass discovers the boundary's resource before the head flushes.
		expect(preloadTags(shell, '/late-sheet.css')).toHaveLength(1);
		expect(stylesheetTags(shell, '/late-sheet.css')).toHaveLength(1);
		expect(shell).toContain('data-precedence="default"');
		gate.resolve('ready');
		const html = await collector.ended;
		expect(html).toContain('late-ready');
		// The revealed boundary payload minted no additional preload or sheet.
		expect(preloadTags(html, '/late-sheet.css')).toHaveLength(1);
		expect(stylesheetTags(html, '/late-sheet.css')).toHaveLength(1);
	});

	// Per ReactDOMFloat-test.js:4040
	// OCTANE DIVERGENCE: React's Fizz demotes a post-shell preinit to a preload
	// (the stylesheet never flushes). Octane's per-round pass discovers the
	// preinit before the shell flushes, so the server coalesces the redundant
	// preload out of the head fold and ships the real resource instead — the
	// shared contract is ONE fetch initiator per href, never two.
	it('a preinitialized stylesheet inside a suspended boundary keeps one initiator per href', async () => {
		const gate = deferred<string>();
		const App = () => {
			Server.preload('/late-preinit.css', { as: 'style' });
			Server.preload('/late-preinit.js', { as: 'script' });
			return Server.createElement(srv.LatePreinitBoundary, { promise: gate.promise }) as any;
		};
		const collector = createPipeableCollector();
		Server.renderToPipeableStream(App as any, {}, {}).pipe(collector.destination);
		await settleMacrotasks();
		gate.resolve('ready');
		const html = await collector.ended;
		expect(html).toContain('late-preinit-ready');
		// Style: the preinit'd sheet replaced the preload entirely.
		expect(preloadTags(html, '/late-preinit.css')).toHaveLength(0);
		expect(stylesheetTags(html, '/late-preinit.css')).toHaveLength(1);
		// Script: one executable, and the preload coalesced away too.
		expect(preloadTags(html, '/late-preinit.js')).toHaveLength(0);
		expect(html.match(/<script src="\/late-preinit\.js" async[^>]*>/g) ?? []).toHaveLength(1);
	});

	// Per ReactDOMFloat-test.js:4873
	it('preloads only once per identity when stylesheets, scripts, and module scripts render late', async () => {
		const gate = deferred<string>();
		const App = () => {
			Server.preload('/late-all.css', { as: 'style' });
			Server.preload('/late-all.js', { as: 'script' });
			Server.preloadModule('/late-all.mjs');
			return Server.createElement(srv.LateAllBoundary, { promise: gate.promise }) as any;
		};
		const collector = createPipeableCollector();
		Server.renderToPipeableStream(App as any, {}, {}).pipe(collector.destination);
		await settleMacrotasks();
		gate.resolve('ready');
		const html = await collector.ended;
		expect(html).toContain('late-all-ready');
		// One preload per identity (preload-then-render keeps both tags, one-way).
		expect(preloadTags(html, '/late-all.css')).toHaveLength(1);
		expect(preloadTags(html, '/late-all.js')).toHaveLength(1);
		expect(preloadTags(html, '/late-all.mjs', 'modulepreload')).toHaveLength(1);
		// Exactly one applied resource per identity across all forms.
		expect(stylesheetTags(html, '/late-all.css')).toHaveLength(1);
		expect(html.match(/src="\/late-all\.js"/g) ?? []).toHaveLength(1);
		expect(html.match(/src="\/late-all\.mjs"/g) ?? []).toHaveLength(1);
	});

	// Per ReactDOMFloat-test.js:5335
	it('does not flush fallback-authored hoistables into the head', async () => {
		const gate = deferred<string>();
		const collector = createPipeableCollector();
		Server.renderToPipeableStream(srv.FallbackMetaBoundary, { promise: gate.promise }, {}).pipe(
			collector.destination,
		);
		await settleMacrotasks();
		const shell = collector.chunks.join('');
		const shellHead = shell.slice(0, shell.indexOf('<div class="fm-host"'));
		// The pending fallback is showing, yet its metadata never reached the
		// head fold; the (still suspended) primary content's metadata did.
		expect(shell).toContain('class="fb"');
		expect(shellHead).toContain('primary-meta');
		expect(shellHead).not.toContain('fallback-meta');
		expect(shellHead).not.toContain('/fallback-author');
		gate.resolve('ready');
		const html = await collector.ended;
		const head = html.slice(0, html.indexOf('<div class="fm-host"'));
		expect(head).toContain('primary-meta');
		expect(head).not.toContain('fallback-meta');
		expect(head).not.toContain('/fallback-author');
	});

	// Per ReactDOMFloat-test.js:5431 — 'avoids flushing hoistables from completed
	// boundaries nested inside fallbacks': fallback suppression is TRANSITIVE. A
	// resolved boundary rendered inside a pending boundary's fallback is still
	// fallback territory — its markup shows, its hoistables never reach the head
	// (the fallback is discarded at reveal, but a streamed head line would be
	// permanent).
	it('suppresses hoistables from completed boundaries nested inside fallbacks', async () => {
		const outer = deferred<string>();
		const collector = createPipeableCollector();
		Server.renderToPipeableStream(srv.NestedFallbackMetaBoundary, {
			promise: outer.promise,
			inner: Promise.resolve('np'),
		}).pipe(collector.destination);
		await settleMacrotasks();
		const shell = collector.chunks.join('');
		const shellHead = shell.slice(0, shell.indexOf('<div class="nfm-host"'));
		// The fallback's nested boundary resolved and its markup shows (inline or
		// via its reveal carrier, where attribute quotes arrive JSON-escaped)…
		expect(shell).toMatch(/class=\\?"nested-primary\\?">np/);
		// …but its metadata is fallback content: never in the head. The (still
		// suspended) primary content's metadata is.
		expect(shellHead).toContain('primary-meta');
		expect(shellHead).not.toContain('nested-primary-meta');
		outer.resolve('ready');
		const html = await collector.ended;
		const head = html.slice(0, html.indexOf('<div class="nfm-host"'));
		expect(head).toContain('primary-meta');
		expect(head).not.toContain('nested-primary-meta');
	});

	// Per ReactDOMFloat-test.js:5496
	it('flushes nothing before the shell; a pre-suspension preinit folds into the shell', async () => {
		const gate = deferred<string>();
		const collector = createPipeableCollector();
		Server.renderToPipeableStream(srv.RootSuspendedPreinit, { promise: gate.promise }, {}).pipe(
			collector.destination,
		);
		await settleMacrotasks();
		// The root is still suspended: no bytes (hoistables included) may flush.
		expect(collector.chunks).toEqual([]);
		gate.resolve('go');
		const html = await collector.ended;
		const script = html.indexOf('<script src="/preamble.js" async');
		const content = html.indexOf('<div class="preamble-ready"');
		expect(script).toBeGreaterThan(-1);
		expect(content).toBeGreaterThan(-1);
		expect(script).toBeLessThan(content);
	});
});

describe('Float evidence — hints against already-present resources', () => {
	// Per ReactDOMFloat-test.js:4093
	it('does not insert a preload when the underlying resource already exists in the document', async () => {
		const App = () => {
			Server.preload('/doc-font.woff2', { as: 'font' });
			return Server.createElement(
				'div',
				null,
				Server.createElement(floatSrv.SheetA, null),
				Server.createElement(floatSrv.AsyncScript, null),
			) as any;
		};
		const r = await Server.renderToString(App as any);
		// The SSR head (stylesheet + async script + font preload) lands in the
		// document, exactly as a served page would present it to the client.
		document.head.insertAdjacentHTML('afterbegin', r.html.slice(0, r.html.indexOf('<div')));
		expect(document.head.querySelectorAll('link[rel="stylesheet"][href="/base.css"]')).toHaveLength(
			1,
		);

		preload('/base.css', { as: 'style' });
		preload('/analytics.js', { as: 'script' });
		preload('/doc-font.woff2', { as: 'font' });
		// No new preloads: the stylesheet/script resources and the SSR-emitted
		// font preload already satisfy every request.
		expect(document.head.querySelector('link[rel="preload"][href="/base.css"]')).toBeNull();
		expect(document.head.querySelector('link[rel="preload"][href="/analytics.js"]')).toBeNull();
		expect(
			document.head.querySelectorAll('link[rel="preload"][href="/doc-font.woff2"]'),
		).toHaveLength(1);
	});
});

describe('Float evidence — preload keying and option serialization', () => {
	// Per ReactDOMFloat-test.js:4148
	it('keys image preloads on imageSrcSet+imageSizes, falling back to href; non-image preloads key on href', () => {
		preload('img-foo', { as: 'image' });
		preload('img-foo', { as: 'image' });
		preload('img-foo', { as: 'image', imageSrcSet: 'fooset' });
		preload('img-foo2', { as: 'image', imageSrcSet: 'fooset' });
		preload('img-foo', { as: 'image', imageSrcSet: 'fooset', imageSizes: 'foosizes' });
		preload('img-foo2', { as: 'image', imageSrcSet: 'fooset', imageSizes: 'foosizes' });
		// imageSizes without imageSrcSet does not participate in the key.
		preload('img-foo', { as: 'image', imageSizes: 'foosizes' });
		preload('img-foo', { as: 'image', imageSizes: 'foosizes' });
		// Non-image destinations always key on href, srcset options or not.
		preload('other-bar', { as: 'somethingelse' });
		preload('other-bar', { as: 'somethingelse', imageSrcSet: 'makes no sense' });
		preload('other-bar', {
			as: 'somethingelse',
			imageSrcSet: 'makes no sense',
			imageSizes: 'makes no sense',
		});

		const links = document.head.querySelectorAll('link[rel="preload"]');
		expect(links).toHaveLength(4);
		expect(document.head.querySelectorAll('link[rel="preload"][href="img-foo"]')).toHaveLength(1);
		const bySet = document.head.querySelector('link[imagesrcset="fooset"]:not([imagesizes])')!;
		expect(bySet).not.toBeNull();
		expect(bySet.hasAttribute('href')).toBe(false);
		expect(
			document.head.querySelectorAll('link[imagesrcset="fooset"][imagesizes="foosizes"]'),
		).toHaveLength(1);
		const other = document.head.querySelectorAll('link[rel="preload"][href="other-bar"]');
		expect(other).toHaveLength(1);
		expect(other[0].getAttribute('as')).toBe('somethingelse');
	});

	// Per ReactDOMFloat-test.js:4289
	it('serializes referrerPolicy on image preloads on the client and the server', async () => {
		preload('/rp-client', {
			as: 'image',
			imageSrcSet: '/rp-client',
			imageSizes: '100vw',
			referrerPolicy: 'no-referrer',
		});
		const link = document.head.querySelector('link[rel="preload"][imagesrcset="/rp-client"]')!;
		expect(link).not.toBeNull();
		expect(link.getAttribute('referrerpolicy')).toBe('no-referrer');
		expect(link.getAttribute('imagesizes')).toBe('100vw');
		expect(link.hasAttribute('href')).toBe(false);

		const App = () => {
			Server.preload('/rp-server', {
				as: 'image',
				imageSrcSet: '/rp-server',
				imageSizes: '100vw',
				referrerPolicy: 'no-referrer',
			});
			return Server.createElement('div', null, 'hello') as any;
		};
		const r = await Server.renderToString(App as any);
		expect(r.html).toMatch(
			/<link rel="preload"[^>]*imagesrcset="\/rp-server"[^>]*referrerpolicy="no-referrer"/,
		);
		expect(r.html).not.toContain('href="/rp-server"');
	});

	// Per ReactDOMFloat-test.js:4749
	it('serializes media on image preloads on the client and the server', async () => {
		preload('/media-client', {
			as: 'image',
			imageSrcSet: '/media-client',
			imageSizes: '100vw',
			media: 'screen and (max-width: 480px)',
		});
		const link = document.head.querySelector('link[rel="preload"][imagesrcset="/media-client"]')!;
		expect(link).not.toBeNull();
		expect(link.getAttribute('media')).toBe('screen and (max-width: 480px)');

		const App = () => {
			Server.preload('/media-server', {
				as: 'image',
				imageSrcSet: '/media-server',
				imageSizes: '100vw',
				media: 'print and (min-width: 768px)',
			});
			return Server.createElement('div', null, 'hello') as any;
		};
		const r = await Server.renderToString(App as any);
		expect(r.html).toMatch(
			/<link rel="preload"[^>]*imagesrcset="\/media-server"[^>]*media="print and \(min-width: 768px\)"/,
		);
	});

	// Per ReactDOMFloat-test.js:6172 (and :6930 for the preinit forms)
	it('supports fetchPriority on preload and preinit, client and server', async () => {
		preload('/fp-high.js', { as: 'script', fetchPriority: 'high' });
		preload('/fp-low.css', { as: 'style', fetchPriority: 'low' });
		preload('/fp-auto.css', { as: 'style', fetchPriority: 'auto' });
		expect(
			document.head
				.querySelector('link[rel="preload"][href="/fp-high.js"]')!
				.getAttribute('fetchpriority'),
		).toBe('high');
		expect(
			document.head
				.querySelector('link[rel="preload"][href="/fp-low.css"]')!
				.getAttribute('fetchpriority'),
		).toBe('low');
		expect(
			document.head
				.querySelector('link[rel="preload"][href="/fp-auto.css"]')!
				.getAttribute('fetchpriority'),
		).toBe('auto');

		preinit('/fpi-high.js', { as: 'script', fetchPriority: 'high' });
		preinit('/fpi-low.css', { as: 'style', fetchPriority: 'low' });
		const script = document.head.querySelector('script[src="/fpi-high.js"]')!;
		expect(script.getAttribute('fetchpriority')).toBe('high');
		expect((script as HTMLScriptElement).async).toBe(true);
		const sheet = document.head.querySelector('link[rel="stylesheet"][href="/fpi-low.css"]')!;
		expect(sheet.getAttribute('fetchpriority')).toBe('low');
		expect(sheet.getAttribute('data-precedence')).toBe('default');

		const App = () => {
			Server.preload('/sfp-high.js', { as: 'script', fetchPriority: 'high' });
			Server.preinit('/sfp-low.css', { as: 'style', fetchPriority: 'low' });
			Server.preinit('/sfp-script.js', { as: 'script', fetchPriority: 'high' });
			return Server.createElement('div', null, 'hello') as any;
		};
		const r = await Server.renderToString(App as any);
		expect(r.html).toMatch(/<link rel="preload" href="\/sfp-high\.js"[^>]*fetchpriority="high"/);
		expect(r.html).toMatch(
			/<link rel="stylesheet" href="\/sfp-low\.css" data-precedence="default"[^>]*fetchpriority="low"/,
		);
		expect(r.html).toMatch(/<script src="\/sfp-script\.js" async[^>]*fetchpriority="high"/);
	});

	// Per ReactDOMFloat-test.js:6279
	it('supports nonce on preload, client and server', async () => {
		preload('/nonce-client.js', { as: 'script', nonce: 'abc' });
		const link = document.head.querySelector('link[rel="preload"][href="/nonce-client.js"]')!;
		expect(link.getAttribute('nonce')).toBe('abc');

		const App = () => {
			Server.preload('/nonce-server.js', { as: 'script', nonce: 'abc' });
			return Server.createElement('div', null, 'hello') as any;
		};
		const r = await Server.renderToString(App as any);
		expect(r.html).toMatch(/<link rel="preload" href="\/nonce-server\.js"[^>]*nonce="abc"/);
	});

	// Per ReactDOMFloat-test.js:6320
	it('preloads scripts as modules with cors, integrity, and non-default destinations', async () => {
		preloadModule('/pm-plain.mjs');
		preloadModule('/pm-default.mjs', { as: 'script' });
		preloadModule('/pm-cors.mjs', { crossOrigin: 'use-credentials' });
		preloadModule('/pm-integrity.mjs', { integrity: 'some hash' });
		preloadModule('/pm-sw.mjs', { as: 'serviceworker' });
		preloadModule('/pm-plain.mjs'); // deduped by href
		const links = document.head.querySelectorAll('link[rel="modulepreload"]');
		expect(links).toHaveLength(5);
		expect(
			document.head
				.querySelector('link[rel="modulepreload"][href="/pm-cors.mjs"]')!
				.getAttribute('crossorigin'),
		).toBe('use-credentials');
		expect(
			document.head
				.querySelector('link[rel="modulepreload"][href="/pm-integrity.mjs"]')!
				.getAttribute('integrity'),
		).toBe('some hash');
		expect(
			document.head
				.querySelector('link[rel="modulepreload"][href="/pm-sw.mjs"]')!
				.getAttribute('as'),
		).toBe('serviceworker');

		const App = () => {
			Server.preloadModule('/spm-cors.mjs', { crossOrigin: 'use-credentials' });
			Server.preloadModule('/spm-sw.mjs', { as: 'serviceworker' });
			Server.preloadModule('/spm-sw.mjs', { as: 'serviceworker' });
			return Server.createElement('div', null, 'hello') as any;
		};
		const r = await Server.renderToString(App as any);
		expect(r.html).toMatch(
			/<link rel="modulepreload" href="\/spm-cors\.mjs"[^>]*crossorigin="use-credentials"/,
		);
		expect(r.html.match(/href="\/spm-sw\.mjs"/g) ?? []).toHaveLength(1);
		expect(r.html).toMatch(/<link rel="modulepreload" href="\/spm-sw\.mjs"[^>]*as="serviceworker"/);
	});
});

describe('Float evidence — malformed hint diagnostics', () => {
	// Per ReactDOMFloat-test.js:6733
	// Octane's diagnostics are adapted (Octane-branded messages), not
	// React-message-exact; the trigger set and the no-op outcome are the contract.
	it('preinit dev-warns and no-ops on invalid href or options', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			preinit(undefined as any, { as: 'style' } as any);
			preinit('', { as: 'style' });
			preinit('/bad-preinit', null as any);
			preinit('/bad-preinit', {} as any);
			preinit('/bad-preinit', { as: 'foo' });
			const warns = errSpy.mock.calls.map((c) => String(c[0]));
			expect(warns.filter((m) => m.includes('preinit'))).toHaveLength(5);
			expect(document.head.querySelector('[href="/bad-preinit"]')).toBeNull();
			expect(document.head.querySelector('script[src="/bad-preinit"]')).toBeNull();
		} finally {
			errSpy.mockRestore();
		}
	});

	// Per ReactDOMFloat-test.js:6407 (and :7113 for preinitModule)
	// Octane warns on invalid hrefs; invalid option SHAPES are handled leniently
	// (the tag still inserts) and a non-script preinitModule destination fails
	// closed as a no-op rather than warning.
	it('module hints dev-warn on invalid hrefs and stay no-ops; valid hrefs still insert', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			preloadModule(undefined as any);
			preloadModule('');
			preloadModule(123 as any);
			preinitModule(undefined as any);
			preinitModule('');
			const warns = errSpy.mock.calls.map((c) => String(c[0]));
			expect(warns.filter((m) => m.includes('preloadModule'))).toHaveLength(3);
			expect(warns.filter((m) => m.includes('preinitModule'))).toHaveLength(2);
			expect(document.head.querySelector('link[rel="modulepreload"]')).toBeNull();

			// Lenient option shapes: the module preload for a valid href inserts.
			preloadModule('/lenient-1.mjs', true as any);
			preloadModule('/lenient-2.mjs', { as: true } as any);
			expect(document.head.querySelectorAll('link[rel="modulepreload"]')).toHaveLength(2);

			// preinitModule has only the script destination; others fail closed.
			preinitModule('/fail-closed.mjs', { as: 'style' });
			expect(document.head.querySelector('script[src="/fail-closed.mjs"]')).toBeNull();
			expect(document.head.querySelector('link[href="/fail-closed.mjs"]')).toBeNull();
		} finally {
			errSpy.mockRestore();
		}
	});
});

describe('Float evidence — hint calls from render and effect positions', () => {
	const containers: HTMLElement[] = [];
	const roots: Array<{ unmount(): void }> = [];
	function mountInto(body: any): void {
		const c = document.createElement('div');
		document.body.appendChild(c);
		containers.push(c);
		const root = createRoot(c);
		roots.push(root);
		root.render(body, {});
	}
	afterEach(() => {
		for (const r of roots.splice(0)) r.unmount();
		for (const c of containers.splice(0)) c.remove();
	});

	// Per ReactDOMFloat-test.js:6008
	it('preload works from render, insertion, layout, and passive effects; font preloads carry type and anonymous CORS', async () => {
		await act(() => mountInto(RenderAndEffectPreloads));
		const render = document.head.querySelector('link[rel="preload"][href="/pl-render.css"]')!;
		expect(render.getAttribute('as')).toBe('style');
		const font = document.head.querySelector('link[rel="preload"][href="/pl-font.woff2"]')!;
		expect(font.getAttribute('as')).toBe('font');
		expect(font.getAttribute('type')).toBe('font/woff2');
		expect(font.getAttribute('crossorigin')).toBe('');
		expect(
			document.head.querySelector('link[rel="preload"][href="/pl-insertion.js"][as="script"]'),
		).not.toBeNull();
		const layoutFont = document.head.querySelector('link[rel="preload"][href="/pl-layout.woff2"]')!;
		expect(layoutFont.getAttribute('crossorigin')).toBe('');
		expect(
			document.head.querySelector('link[rel="preload"][href="/pl-passive.css"][as="style"]'),
		).not.toBeNull();
	});

	// Per ReactDOMFloat-test.js:6563
	it('preinit(as style) from an effect inserts the stylesheet into document.head', async () => {
		await act(() => mountInto(EffectPreinitStyle));
		const sheet = document.head.querySelector(
			'link[rel="stylesheet"][href="/effect-preinit.css"]',
		)!;
		expect(sheet).not.toBeNull();
		expect(sheet.getAttribute('data-precedence')).toBe('default');
		// The rendered tree carries no trace of the resource.
		expect(document.body.querySelector('link')).toBeNull();
	});

	// Per ReactDOMFloat-test.js:6480
	it('preinit(as style) during render creates one deduped stylesheet resource', async () => {
		await act(() => {
			mountInto(RenderPreinitStyle);
			mountInto(RenderPreinitStyle);
		});
		expect(
			document.head.querySelectorAll('link[rel="stylesheet"][href="/render-preinit.css"]'),
		).toHaveLength(1);
		expect(
			document.head
				.querySelector('link[rel="stylesheet"][href="/render-preinit.css"]')!
				.getAttribute('data-precedence'),
		).toBe('default');
	});

	// Per ReactDOMFloat-test.js:6631
	it('preinit(as script) during render creates one deduped async script that persists past unmount', async () => {
		await act(() => {
			mountInto(RenderPreinitScript);
			mountInto(RenderPreinitScript);
		});
		const scripts = document.head.querySelectorAll('script[src="/render-preinit.js"]');
		expect(scripts).toHaveLength(1);
		expect((scripts[0] as HTMLScriptElement).async).toBe(true);
		await act(() => {
			for (const r of roots.splice(0)) r.unmount();
		});
		// Resources are never removed: re-running a script is unsafe.
		expect(document.head.querySelectorAll('script[src="/render-preinit.js"]')).toHaveLength(1);
	});
});
