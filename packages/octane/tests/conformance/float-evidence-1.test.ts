// Conformance evidence for ReactDOMFloat-test.js cases (stable pin, plus one
// canary-only case cited by commit). Each `it` cites its upstream case and
// asserts Octane's observable outcome through public APIs: Float resources are
// global (deduped by href/src), hoisted into document.head / the SSR head fold,
// precedence-grouped in first-encounter order, and retained after unmount.
// Suspensey commits (suspend-until-loaded) are documented as out of scope, so
// the load-event halves of the upstream cases are not ported here.
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	act,
	createRoot,
	hydrateRoot,
	flushSync,
	preloadModule,
	resetFloatResourceState,
} from '../../src/index.js';
import * as Server from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import {
	activateStreamedMarkup,
	createPipeableCollector,
	deferred,
	resetStreamRuntimeGlobals,
} from '../_server-stream.js';
import {
	AttrSheet,
	MixedHead,
	NoModuleScripts,
	ScriptSwapHost,
	setSwapPhase,
	TextResourceSiblings,
} from '../_fixtures/float-evidence-1.tsrx';

const srv = loadServerFixture('packages/octane/tests/_fixtures/float-evidence-1.tsrx') as Record<
	string,
	any
>;

/** Hrefs of sheet-family resources currently in the head, in document order. */
function sheetHrefs(): string[] {
	return Array.from(
		document.head.querySelectorAll('link[rel="stylesheet"][data-precedence]'),
		(l) => l.getAttribute('href')!,
	);
}

/** Hrefs in the order they appear inside an HTML string. */
function hrefOrder(html: string, hrefs: string[]): string[] {
	return hrefs
		.map((href) => ({ href, at: html.indexOf(href) }))
		.filter((e) => e.at !== -1)
		.sort((a, b) => a.at - b.at)
		.map((e) => e.href);
}

describe('conformance: React Float resource evidence (slice 1)', () => {
	const containers: HTMLElement[] = [];
	const roots: Array<{ unmount(): void }> = [];
	function mountInto(body: any, props: any = {}): HTMLElement {
		const c = document.createElement('div');
		document.body.appendChild(c);
		containers.push(c);
		const root = createRoot(c);
		roots.push(root);
		root.render(body, props);
		return c;
	}
	afterEach(() => {
		for (const r of roots.splice(0)) r.unmount();
		for (const c of containers.splice(0)) c.remove();
		document.head
			.querySelectorAll(
				'[data-precedence], [data-oct-res], [data-oct-hint], link[rel="modulepreload"], link[rel="preload"], title, meta, script',
			)
			.forEach((el) => el.remove());
		// Resources are page-global by contract; tests reset the page.
		resetFloatResourceState();
		resetStreamRuntimeGlobals();
	});

	// Per ReactDOMFloat-test.js (canary, facebook/react@b740af25):6596 —
	// 'preloads multiple non-script modules with the same as type'
	it('client: preloadModule keys per href, carrying a non-script as type', () => {
		preloadModule('/sw-one.js', { as: 'serviceworker' });
		preloadModule('/sw-one.js', { as: 'serviceworker' }); // deduped
		preloadModule('/sw-two.js', { as: 'serviceworker' });
		const links = document.head.querySelectorAll('link[rel="modulepreload"][as="serviceworker"]');
		expect(Array.from(links, (l) => l.getAttribute('href'))).toEqual(['/sw-one.js', '/sw-two.js']);
	});

	// Per ReactDOMFloat-test.js (canary, facebook/react@b740af25):6596 —
	// 'preloads multiple non-script modules with the same as type'
	it('server: preloadModule folds one modulepreload per href with the as type', async () => {
		const App = () => {
			Server.preloadModule('/ssw-one.js', { as: 'serviceworker' });
			Server.preloadModule('/ssw-one.js', { as: 'serviceworker' }); // deduped
			Server.preloadModule('/ssw-two.js', { as: 'serviceworker' });
			return Server.createElement('div', null, 'x') as any;
		};
		const r = await Server.renderToString(App as any);
		expect(r.html.match(/rel="modulepreload"/g) || []).toHaveLength(2);
		expect(r.html.match(/as="serviceworker"/g) || []).toHaveLength(2);
		expect(r.html.match(/href="\/ssw-one\.js"/g) || []).toHaveLength(1);
		expect(r.html.match(/href="\/ssw-two\.js"/g) || []).toHaveLength(1);
	});

	// Per ReactDOMFloat-test.js:445 — 'can hydrate non Resources in head when
	// Resources are also inserted there' (adapted: Octane roots are Elements,
	// so the head content arrives via Octane's metadata hoist + resource fold
	// instead of an <html> container).
	it('hydration adopts hoisted non-resource head elements alongside inserted resources', async () => {
		const r = await Server.renderToString(srv.MixedHead, {});
		const bodyStart = r.html.indexOf('<main');
		expect(bodyStart).toBeGreaterThan(-1);
		document.head.insertAdjacentHTML('beforeend', r.html.slice(0, bodyStart));
		const c = document.createElement('div');
		document.body.appendChild(c);
		containers.push(c);
		c.innerHTML = r.html.slice(bodyStart);

		const title = document.head.querySelector('title')!;
		const meta = document.head.querySelector('meta[property="og:mixed"]')!;
		const sheet = document.head.querySelector('link[href="/mixed.css"]')!;
		const script = document.head.querySelector('script[src="/mixed.js"]')!;
		expect(title.textContent).toBe('mixed head');

		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const root = hydrateRoot(c, MixedHead, {});
			flushSync(() => {});
			const warns = errSpy.mock.calls.map((call) => String(call[0]));
			expect(warns.filter((m) => m.includes('hydration mismatch'))).toEqual([]);

			// Non-resources ADOPTED (same nodes, no duplicates)…
			expect(document.head.querySelectorAll('title')).toHaveLength(1);
			expect(document.head.querySelector('title')).toBe(title);
			expect(document.head.querySelectorAll('meta[property="og:mixed"]')).toHaveLength(1);
			expect(document.head.querySelector('meta[property="og:mixed"]')).toBe(meta);
			// …and resources deduped against the SSR-emitted tags.
			expect(document.head.querySelectorAll('link[href="/mixed.css"]')).toHaveLength(1);
			expect(document.head.querySelectorAll('script[src="/mixed.js"]')).toHaveLength(1);

			// Unmount: per-site metadata is removed; resources are retained.
			root.unmount();
			expect(title.isConnected).toBe(false);
			expect(meta.isConnected).toBe(false);
			expect(sheet.isConnected).toBe(true);
			expect(script.isConnected).toBe(true);
		} finally {
			errSpy.mockRestore();
		}
	});

	// Per ReactDOMFloat-test.js:647 — 'can acquire a resource after releasing
	// it in the same commit'
	it('re-acquiring a released script resource in one commit keeps the first instance', async () => {
		let c!: HTMLElement;
		await act(() => {
			c = mountInto(ScriptSwapHost);
		});
		const script = document.head.querySelector('script[src="/swap.js"]') as HTMLScriptElement;
		expect(script).not.toBeNull();
		expect(script.async).toBe(true);
		expect(c.querySelector('.swap-a')).not.toBeNull();

		await act(() => setSwapPhase(1));
		expect(c.querySelector('.swap-b')).not.toBeNull();
		const after = document.head.querySelectorAll('script[src="/swap.js"]');
		expect(after).toHaveLength(1);
		// The resource was NOT reconstructed: same element, and the differing
		// prop of the re-acquiring site is not applied (first instance wins).
		expect(after[0]).toBe(script);
		expect(after[0].hasAttribute('data-new')).toBe(false);
	});

	// Per ReactDOMFloat-test.js:1379 — 'inserts text separators following text
	// when followed by an element that is converted to a resource and thus
	// removed from the html inline'
	it('sibling texts survive SSR resource elision and hydrate without mismatch', async () => {
		const r = await Server.renderToString(srv.TextResourceSiblings, {});
		const bodyStart = r.html.indexOf('<div class="text-siblings"');
		expect(bodyStart).toBeGreaterThan(-1);
		const headHtml = r.html.slice(0, bodyStart);
		const bodyHtml = r.html.slice(bodyStart);
		// The resources left no inline trace between the texts…
		expect(bodyHtml).not.toContain('stylesheet');
		// …and hoisted into first-encounter precedence groups.
		expect(hrefOrder(headHtml, ['/sep-foo.css', '/sep-bar.css', '/sep-baz.css'])).toEqual([
			'/sep-foo.css',
			'/sep-bar.css',
			'/sep-baz.css',
		]);

		document.head.insertAdjacentHTML('beforeend', headHtml);
		const c = document.createElement('div');
		document.body.appendChild(c);
		containers.push(c);
		c.innerHTML = bodyHtml;
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const root = hydrateRoot(c, TextResourceSiblings, {});
			flushSync(() => {});
			const warns = errSpy.mock.calls.map((call) => String(call[0]));
			expect(warns.filter((m) => m.includes('hydration mismatch'))).toEqual([]);
			expect(c.querySelector('.text-siblings')!.textContent).toBe('foobarbaz');
			expect(sheetHrefs()).toEqual(['/sep-foo.css', '/sep-bar.css', '/sep-baz.css']);
			root.unmount();
		} finally {
			errSpy.mockRestore();
		}
	});

	// Per ReactDOMFloat-test.js:1425 — 'hoists late stylesheets the correct
	// precedence' (adapted). OCTANE DIVERGENCE: suspensey commits are out of
	// scope, so the load-gated client reveal half does not apply; the ported
	// observable is that statically-declared stylesheets inside boundaries that
	// are still PENDING at shell time join the flushed shell head in normalized
	// precedence groups, alongside a preinit-established group, and the later
	// segment reveals add no duplicate resource tags.
	it('streaming folds pending-boundary stylesheets into the shell head precedence groups', async () => {
		const a = deferred<string>();
		const b = deferred<string>();
		const collector = createPipeableCollector();
		Server.renderToPipeableStream(srv.PendingPrecedenceApp, {
			a: a.promise,
			b: b.promise,
		}).pipe(collector.destination);
		await new Promise((resolve) => setTimeout(resolve, 10));

		const shell = collector.chunks.join('');
		expect(shell).toContain('loading a');
		expect(shell).toContain('loading b');
		expect(shell).not.toContain('pp-a">');
		// All four sheets flushed with the shell, grouped by first-encounter
		// precedence — preset (the preinit runs in authored setup, ahead of the
		// declared sheets), then one (initial, later joined by b), then default
		// (a). The load-bearing claims: pending-boundary sheets are present at
		// shell time, groups are contiguous, and b appends into initial's group.
		expect(
			hrefOrder(shell, ['/pp-initial.css', '/pp-b.css', '/pp-preset.css', '/pp-a.css']),
		).toEqual(['/pp-preset.css', '/pp-initial.css', '/pp-b.css', '/pp-a.css']);
		expect(shell).toContain('data-precedence="preset"');
		expect(shell.match(/data-precedence="one"/g) || []).toHaveLength(2);

		a.resolve('A');
		b.resolve('B');
		const html = await collector.ended;
		// The revealed segments carry the content but never a second copy of a
		// resource: each href appears exactly once in the whole response.
		for (const href of ['/pp-initial.css', '/pp-b.css', '/pp-preset.css', '/pp-a.css']) {
			expect(html.split(href)).toHaveLength(2);
		}
		const c = document.createElement('div');
		document.body.appendChild(c);
		containers.push(c);
		c.innerHTML = html;
		activateStreamedMarkup(c);
		expect(c.querySelector('.pp-a')!.textContent).toBe('A');
		expect(c.querySelector('.pp-b')!.textContent).toBe('B');
	});

	// Per ReactDOMFloat-test.js:1709 — 'normalizes stylesheet resource
	// precedence for all boundaries inlined as part of the shell flush'
	it('SSR normalizes precedence across nested boundaries inlined in one pass', async () => {
		const r = await Server.renderToString(srv.ShellPrecedenceApp, {});
		const expected = [
			'/1one.css',
			'/2one.css',
			'/3one.css',
			'/1two.css',
			'/2two.css',
			'/3three.css',
		];
		expect(hrefOrder(r.html, expected)).toEqual(expected);
		for (const href of expected) {
			expect(r.html.split(href)).toHaveLength(2);
		}
		const bodyText = r.html.slice(r.html.indexOf('<div class="shell-prec"'));
		expect(bodyText).not.toContain('stylesheet');
		expect(bodyText.indexOf('outer')).toBeLessThan(bodyText.indexOf('middle'));
		expect(bodyText.indexOf('middle')).toBeLessThan(bodyText.indexOf('inner'));
	});

	// Per ReactDOMFloat-test.js:2204 — 'encodes attributes consistently whether
	// resources are flushed in shell or in late boundaries' (adapted: Octane's
	// two resource emit paths are the SSR head fold and the client insert; both
	// must serialize options through canonical lowercase attributes, with
	// identity attrs owned by the emit).
	it('server and client emit paths encode resource attributes identically', async () => {
		const r = await Server.renderToString(srv.AttrSheet, {});
		const tag = r.html.match(/<link rel="stylesheet" href="\/attr\.css"[^>]*>/)?.[0];
		expect(tag).toBeTruthy();
		expect(tag).toContain('data-precedence="default"');
		expect(tag).toContain('crossorigin="anonymous"');
		expect(tag).toContain('media="all"');
		expect(tag).toContain('integrity="somehash"');
		expect(tag).toContain('referrerpolicy="origin"');
		expect(tag).toContain('data-foo="&quot;quoted&quot;"');
		// The authoring-side names never leak through.
		expect(tag).not.toContain('crossOrigin');
		expect(tag).not.toContain(' precedence=');

		await act(() => {
			mountInto(AttrSheet);
		});
		const el = document.head.querySelector('link[href="/attr.css"]')!;
		expect(el.getAttribute('data-precedence')).toBe('default');
		expect(el.getAttribute('crossorigin')).toBe('anonymous');
		expect(el.getAttribute('media')).toBe('all');
		expect(el.getAttribute('integrity')).toBe('somehash');
		expect(el.getAttribute('referrerpolicy')).toBe('origin');
		expect(el.getAttribute('data-foo')).toBe('"quoted"');
		expect(el.hasAttribute('precedence')).toBe(false);
	});

	// Per ReactDOMFloat-test.js:2936 — 'does not preload nomodule scripts'
	it('server: nomodule scripts hoist (async) or stay in place (sync) without preloads', async () => {
		const r = await Server.renderToString(srv.NoModuleScripts, {});
		expect(r.html).not.toContain('rel="preload"');
		expect(r.html).not.toContain('rel="modulepreload"');
		const bodyStart = r.html.indexOf('<div class="nomodule-host"');
		const headHtml = r.html.slice(0, bodyStart);
		const bodyHtml = r.html.slice(bodyStart);
		// The async form is a hoisted resource that keeps its nomodule attribute…
		const hoisted = headHtml.match(/<script src="\/nomodule-async\.js"[^>]*>/)?.[0];
		expect(hoisted).toBeTruthy();
		expect(hoisted).toContain(' async');
		expect(hoisted).toContain('nomodule');
		expect(bodyHtml).not.toContain('/nomodule-async.js');
		// …while the sync form stays an ordinary in-place element.
		const inline = bodyHtml.match(/<script src="\/nomodule-sync\.js"[^>]*>/)?.[0];
		expect(inline).toBeTruthy();
		expect(inline).toContain('nomodule');
		expect(headHtml).not.toContain('/nomodule-sync.js');
	});

	// Per ReactDOMFloat-test.js:2936 — client half of the same contract.
	it('client: nomodule scripts hoist (async) or stay in place (sync) without preloads', async () => {
		let c!: HTMLElement;
		await act(() => {
			c = mountInto(NoModuleScripts);
		});
		expect(
			document.head.querySelector('link[rel="preload"], link[rel="modulepreload"]'),
		).toBeNull();
		const hoisted = document.head.querySelector(
			'script[src="/nomodule-async.js"]',
		) as HTMLScriptElement;
		expect(hoisted).not.toBeNull();
		expect(hoisted.async).toBe(true);
		expect(hoisted.hasAttribute('nomodule')).toBe(true);
		expect(hoisted.getAttribute('data-meaningful')).toBe('');
		const inline = c.querySelector('script[src="/nomodule-sync.js"]') as HTMLScriptElement;
		expect(inline).not.toBeNull();
		expect(inline.hasAttribute('nomodule')).toBe(true);
		expect(document.head.querySelector('script[src="/nomodule-sync.js"]')).toBeNull();
	});
});
