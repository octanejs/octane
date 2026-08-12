// React Float parity: <link rel="stylesheet" href precedence> and
// <script async src> rendered in components are RESOURCES, not per-site head
// elements — hoisted to document.head, deduped by href/src identity across the
// whole page, stylesheets ordered by precedence group (first-encounter group
// order, appended within a group), and retained after unmount (React never
// removes a resource: unloading styles or re-running scripts is unsafe).
// Suspend-until-loaded ("suspensey" commit) is intentionally NOT part of this
// contract — Octane documents that as out of scope.
// Links WITHOUT precedence keep the existing per-site head-element behavior.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot, resetFloatResourceState } from '../src/index.js';
import * as Server from 'octane/server';
import { loadServerFixture } from './_server-fixture.js';
import {
	activateStreamedMarkup,
	collectPipeableStream,
	createPipeableCollector,
	deferred,
	resetStreamRuntimeGlobals,
} from './_server-stream.js';
import { preinitModule } from '../src/index.js';
import { GatedSheetBoundary, GatedSheetContent } from './_fixtures/float-stream.tsrx';
import {
	SheetA,
	ModuleScript,
	SheetADuplicate,
	SheetHigh,
	SheetLate,
	PlainLink,
	AsyncScript,
	AsyncScriptDuplicate,
	ReturnScript,
	ReturnSheet,
	StyleRes,
	StyleResDuplicate,
	StyleResHigh,
	ScopedControl,
	ToggleHost,
	setSheetVisible,
} from './_fixtures/float-resources.tsrx';
import {
	ParentChild,
	LateArmAfterSibling,
	NestedTryOrder,
	LocalHref,
	MixedLocalStatic,
	FailingArm,
} from './_fixtures/float-group-order.tsrx';

function sheetHrefs(): string[] {
	return Array.from(
		document.head.querySelectorAll('link[rel="stylesheet"][data-precedence]'),
		(l) => l.getAttribute('href')!,
	);
}

describe('Float resources — client', () => {
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
		document.head
			.querySelectorAll('[data-precedence], [data-oct-res]')
			.forEach((el) => el.remove());
		// Resources are page-global by contract; tests reset the page.
		resetFloatResourceState();
	});

	it('a precedence stylesheet hoists to head and dedupes by href across components', async () => {
		await act(() => {
			mountInto(SheetA);
			mountInto(SheetADuplicate);
		});
		expect(sheetHrefs()).toEqual(['/base.css']);
		// The body carries no trace of the resource element.
		expect(document.body.querySelector('link')).toBeNull();
	});

	it('groups order by first encounter; later same-precedence sheets append to their group', async () => {
		await act(() => {
			mountInto(SheetA); // default group
			mountInto(SheetHigh); // high group (new, appended after default)
			mountInto(SheetLate); // default again → into the default group, before /high.css
		});
		expect(sheetHrefs()).toEqual(['/base.css', '/late-default.css', '/high.css']);
		const high = document.head.querySelector('link[href="/high.css"]')!;
		expect(high.getAttribute('crossorigin')).toBe('anonymous');
		expect(high.getAttribute('data-precedence')).toBe('high');
	});

	it('resources persist after unmount; per-site links (no precedence) are removed', async () => {
		await act(() => mountInto(ToggleHost));
		expect(sheetHrefs()).toEqual(['/base.css']);
		await act(() => setSheetVisible(false));
		// The @if arm unmounted, but the stylesheet resource stays.
		expect(sheetHrefs()).toEqual(['/base.css']);

		// Control: a precedence-less hoisted link keeps per-site removal.
		const c = document.createElement('div');
		document.body.appendChild(c);
		const root = createRoot(c);
		await act(() => root.render(PlainLink, {}));
		expect(document.head.querySelector('link[href="/feed.xml"]')).not.toBeNull();
		root.unmount();
		expect(document.head.querySelector('link[href="/feed.xml"]')).toBeNull();
		c.remove();
	});

	it('<style href precedence> is a style resource: hoisted, deduped, precedence-grouped with links', async () => {
		await act(() => {
			mountInto(SheetA); // default group (link)
			mountInto(StyleRes); // default group (style, appends after the link)
			mountInto(StyleResDuplicate); // deduped by href identity
			mountInto(StyleResHigh); // high group (new)
		});
		const styles = document.head.querySelectorAll('style[data-href="inline-tokens"]');
		expect(styles).toHaveLength(1);
		expect(styles[0].getAttribute('data-precedence')).toBe('default');
		expect(styles[0].textContent).toContain('.tokens');
		expect(styles[0].textContent).toContain('teal');
		// Unscoped: the CSS ships verbatim-by-meaning, no component hash class.
		expect(styles[0].textContent).not.toMatch(/\.tokens\.[a-z0-9]/i);
		// Group order: default (link then style, discovery order) then high.
		const ordered = Array.from(
			document.head.querySelectorAll('[data-precedence]'),
			(el) => el.getAttribute('href') ?? el.getAttribute('data-href'),
		);
		expect(ordered).toEqual(['/base.css', 'inline-tokens', 'inline-high']);
		const high = document.head.querySelector('style[data-href="inline-high"]')!;
		expect(high.getAttribute('media')).toBe('screen');
		expect(document.body.querySelector('style')).toBeNull();
		// Persistence: style resources survive unmount like link resources.
		await act(() => {
			for (const r of roots.splice(0)) r.unmount();
		});
		expect(document.head.querySelectorAll('style[data-href="inline-tokens"]')).toHaveLength(1);
	});

	it('control: a bare <style> keeps scoped-CSS behavior (no head resource)', async () => {
		await act(() => mountInto(ScopedControl));
		expect(document.head.querySelector('style[data-href]')).toBeNull();
		expect(document.head.querySelector('style[data-precedence]')).toBeNull();
		// Scoped CSS injected its hashed sheet and stamped the hash class.
		const scoped = document.querySelector('#scoped-control')!;
		expect(scoped.className).not.toBe('scoped'); // hash class added
		const injected = document.head.querySelector('style[data-octane]');
		expect(injected).not.toBeNull();
		expect(injected!.textContent).toContain('.scoped.');
	});

	it('return-position (value-body) trees classify resources like @{} bodies', async () => {
		await act(() => {
			mountInto(ReturnScript);
			mountInto(ReturnSheet);
		});
		const script = document.head.querySelector('script[src="/return-script.js"]');
		expect(script).not.toBeNull();
		expect((script as HTMLScriptElement).async).toBe(true);
		expect(document.body.querySelector('script')).toBeNull();
		expect(sheetHrefs()).toEqual(['/return.css']);
		expect(document.body.querySelector('link')).toBeNull();
		expect(document.body.textContent).toContain('RS');
		expect(document.body.textContent).toContain('RL');
	});

	it('async scripts hoist to head, dedupe by src, and persist', async () => {
		await act(() => {
			mountInto(AsyncScript);
			mountInto(AsyncScriptDuplicate);
		});
		const scripts = document.head.querySelectorAll('script[src="/analytics.js"]');
		expect(scripts).toHaveLength(1);
		expect((scripts[0] as HTMLScriptElement).async).toBe(true);
		expect(document.body.querySelector('script')).toBeNull();
		await act(() => {
			for (const r of roots.splice(0)) r.unmount();
		});
		expect(document.head.querySelectorAll('script[src="/analytics.js"]')).toHaveLength(1);
	});
});

describe('Float resources — SSR + hydration dedupe', () => {
	afterEach(() => {
		document.head
			.querySelectorAll('[data-precedence], [data-oct-res]')
			.forEach((el) => el.remove());
		resetFloatResourceState();
	});

	const srv = loadServerFixture('packages/octane/tests/_fixtures/float-resources.tsrx') as Record<
		string,
		any
	>;

	it('SSR folds deduped, precedence-grouped resources into the head output', async () => {
		const App = () =>
			Server.createElement(
				'div',
				null,
				Server.createElement(srv.SheetHigh, null),
				Server.createElement(srv.SheetA, null),
				Server.createElement(srv.SheetADuplicate, null),
				Server.createElement(srv.SheetLate, null),
				Server.createElement(srv.AsyncScript, null),
				Server.createElement(srv.AsyncScriptDuplicate, null),
			) as any;
		const r = await Server.renderToString(App as any);
		expect(r.html.match(/\/base\.css/g) || []).toHaveLength(1);
		expect(r.html.match(/\/analytics\.js/g) || []).toHaveLength(1);
		// Precedence groups: /high.css was encountered first, so the high group
		// precedes default; /late-default.css appends into the default group.
		const high = r.html.indexOf('/high.css');
		const base = r.html.indexOf('/base.css');
		const late = r.html.indexOf('/late-default.css');
		expect(high).toBeGreaterThan(-1);
		expect(base).toBeGreaterThan(high);
		expect(late).toBeGreaterThan(base);
		expect(r.html).toContain('data-precedence="high"');
		expect(r.html).toContain('data-oct-res');
	});

	it('streamed shells carry deduped resources in the flushed head', async () => {
		const App = () =>
			Server.createElement(
				'div',
				null,
				Server.createElement(srv.SheetA, null),
				Server.createElement(srv.SheetADuplicate, null),
				Server.createElement(srv.AsyncScript, null),
			) as any;
		const { html, errors } = await collectPipeableStream(App as any);
		expect(errors).toEqual([]);
		expect(html.match(/\/base\.css/g) || []).toHaveLength(1);
		expect(html.match(/\/analytics\.js/g) || []).toHaveLength(1);
		expect(html).toContain('data-precedence="default"');
	});

	it('SSR folds style resources into precedence groups; hydration seeds from data-href', async () => {
		const App = () =>
			Server.createElement(
				'div',
				null,
				Server.createElement(srv.SheetA, null),
				Server.createElement(srv.StyleRes, null),
				Server.createElement(srv.StyleResDuplicate, null),
			) as any;
		const r = await Server.renderToString(App as any);
		expect(r.html.match(/data-href="inline-tokens"/g) || []).toHaveLength(1);
		expect(r.html).toContain('.tokens');
		// Same default group, discovery order: the link precedes the style tag.
		expect(r.html.indexOf('/base.css')).toBeLessThan(r.html.indexOf('inline-tokens'));

		// SSR head lands in the document; the hydrating client's render dedupes.
		document.head.insertAdjacentHTML('afterbegin', r.html.slice(0, r.html.indexOf('<div')));
		const c = document.createElement('div');
		document.body.appendChild(c);
		const root = createRoot(c);
		await act(() => root.render(StyleRes, {}));
		expect(document.head.querySelectorAll('style[data-href="inline-tokens"]')).toHaveLength(1);
		root.unmount();
		c.remove();
	});

	it('SSR fails closed on style content that could close the tag', async () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const App = () => {
				Server.ssrStyleResource(
					{ href: 'evil', precedence: 'default' },
					'.x{}</style><script>alert(1)</script>',
				);
				return Server.createElement('div', null, 'x') as any;
			};
			const r = await Server.renderToString(App as any);
			expect(r.html).not.toContain('alert(1)');
			expect(r.html).not.toContain('data-href="evil"');
			expect(errSpy.mock.calls.some((c) => String(c[0]).includes('</style'))).toBe(true);
		} finally {
			errSpy.mockRestore();
		}
	});

	it('module scripts share ONE identity across SSR and client paths', async () => {
		// (a) SSR preinitModule → client Float discovery adopts, no duplicate.
		const AppA = () => {
			Server.preinitModule('/shared-mod.mjs');
			return Server.createElement('div', null, 'x') as any;
		};
		const rA = await Server.renderToString(AppA as any);
		document.head.insertAdjacentHTML('afterbegin', rA.html.slice(0, rA.html.indexOf('<div')));
		const c = document.createElement('div');
		document.body.appendChild(c);
		const root = createRoot(c);
		await act(() => root.render(ModuleScript, {}));
		expect(document.head.querySelectorAll('script[src="/shared-mod.mjs"]')).toHaveLength(1);
		root.unmount();
		c.remove();
		document.head.querySelectorAll('[data-oct-hint], [data-oct-res]').forEach((el) => el.remove());
		resetFloatResourceState();

		// (b) SSR Float module script → client preinitModule adopts, no duplicate.
		const srvMod = srv.ModuleScript;
		const AppB = () => Server.createElement('div', null, Server.createElement(srvMod, null)) as any;
		const rB = await Server.renderToString(AppB as any);
		document.head.insertAdjacentHTML('afterbegin', rB.html.slice(0, rB.html.indexOf('<div')));
		preinitModule('/shared-mod.mjs');
		expect(document.head.querySelectorAll('script[src="/shared-mod.mjs"]')).toHaveLength(1);
	});

	it('one SSR pass never emits two executables for one module src', async () => {
		const App = () => {
			Server.preinitModule('/pass-mod.mjs');
			return Server.createElement('div', null, Server.createElement(srv.ModuleScript, null)) as any;
		};
		void App;
		const App2 = () => {
			Server.preinitModule('/shared-mod.mjs');
			return Server.createElement('div', null, Server.createElement(srv.ModuleScript, null)) as any;
		};
		const r = await Server.renderToString(App2 as any);
		expect(r.html.match(/src="\/shared-mod\.mjs"/g) || []).toHaveLength(1);
	});

	it('a hydrating client call dedupes against SSR-emitted resources', async () => {
		const App = () =>
			Server.createElement('div', null, Server.createElement(srv.SheetA, null)) as any;
		const r = await Server.renderToString(App as any);
		const headHtml = r.html.slice(0, r.html.indexOf('<div'));
		document.head.insertAdjacentHTML('afterbegin', headHtml);
		expect(sheetHrefs()).toEqual(['/base.css']);

		// The client render of the same component must adopt, not duplicate.
		const c = document.createElement('div');
		document.body.appendChild(c);
		const root = createRoot(c);
		await act(() => root.render(SheetA, {}));
		expect(sheetHrefs()).toEqual(['/base.css']);
		root.unmount();
		c.remove();
	});
});

// A stylesheet resource discovered only AFTER the shell flushed (inside a
// suspended @try arm, or with an href computed from a use() resolution) must
// still reach the streamed response: the tags ride the wave chunks so no-JS
// consumers get the CSS, and the inline stream runtime moves them into
// document.head with the client's precedence grouping so late content is
// styled before hydration and a hydrating client adopts without duplicating.
describe('Float resources — streamed late boundaries', () => {
	const containers: HTMLElement[] = [];
	function streamContainer(): HTMLElement {
		const c = document.createElement('div');
		document.body.appendChild(c);
		containers.push(c);
		return c;
	}
	afterEach(() => {
		for (const c of containers.splice(0)) c.remove();
		document.head
			.querySelectorAll('[data-precedence], [data-oct-res], [data-oct-hint]')
			.forEach((el) => el.remove());
		resetFloatResourceState();
		resetStreamRuntimeGlobals();
	});

	const srvStream = loadServerFixture(
		'packages/octane/tests/_fixtures/float-stream.tsrx',
	) as Record<string, any>;

	// Per ReactDOMFloat-test.js:1923 — 'will include child boundary stylesheet
	// resources in the boundary reveal instruction'.
	it('streams a use()-gated dynamic-href sheet late and moves it into document.head', async () => {
		const d = deferred<string>();
		const collector = createPipeableCollector();
		const { pipe } = Server.renderToPipeableStream(
			srvStream.GatedSheetBoundary,
			{ promise: d.promise },
			{ nonce: 'test-nonce' },
		);
		pipe(collector.destination);
		// Nothing about the sheets is knowable at shell time — not even the href.
		expect(collector.chunks.join('')).not.toContain('gated-x.css');
		expect(collector.chunks.join('')).not.toContain('gated-tokens');
		const shellChunkCount = collector.chunks.length;
		d.resolve('x');
		const html = await collector.ended;

		// The late tags ship exactly once, in the post-shell stream (a no-JS
		// consumer still receives working markup).
		const tail = collector.chunks.slice(shellChunkCount).join('');
		expect(tail.match(/\/gated-x\.css/g) || []).toHaveLength(1);
		expect(tail).toContain('data-precedence="default"');
		expect(tail.match(/data-href="gated-tokens"/g) || []).toHaveLength(1);
		expect(tail).toContain('.gated-ready');
		// CSP: every inline script the wave emits (the resource hoist included)
		// carries the render nonce.
		const scripts = tail.match(/<script[^>]*/g) ?? [];
		expect(scripts.length).toBeGreaterThan(0);
		for (const tag of scripts) expect(tag).toContain('nonce="test-nonce"');

		// Browser simulation: the stream runtime hoists the tags into head.
		const c = streamContainer();
		c.innerHTML = html;
		activateStreamedMarkup(c);
		expect(
			document.head.querySelectorAll('link[href="/gated-x.css"][data-precedence="default"]'),
		).toHaveLength(1);
		expect(document.head.querySelectorAll('style[data-href="gated-tokens"]')).toHaveLength(1);
		// The revealed content is in place and no carrier markup remains behind.
		expect(c.querySelector('.gated-ready')?.textContent).toBe('x');
		expect(c.querySelector('link')).toBeNull();
		expect(c.querySelector('style[data-href]')).toBeNull();

		// Hydration adopts the streamed DOM and the head resources — no duplicates.
		const revealed = c.querySelector('.gated-ready');
		const root = hydrateRoot(c, GatedSheetBoundary as any, {
			promise: new Promise<string>(() => {}),
		});
		flushSync(() => {});
		expect(c.querySelector('.gated-ready')).toBe(revealed);
		expect(document.head.querySelectorAll('link[href="/gated-x.css"]')).toHaveLength(1);
		expect(document.head.querySelectorAll('style[data-href="gated-tokens"]')).toHaveLength(1);
		root.unmount();
	});

	// Per ReactDOMFloat-test.js:2041 — 'will hoist resources of child boundaries
	// emitted as part of a partial boundary to the parent boundary': the
	// still-pending inner boundary's sheet rides the wave that reveals its
	// parent.
	it("hoists a nested pending boundary's sheet into the outer boundary's reveal wave", async () => {
		const outer = deferred<string>();
		const inner = deferred<string>();
		const collector = createPipeableCollector();
		const { pipe } = Server.renderToPipeableStream(srvStream.NestedLateBoundaries, {
			outer: outer.promise,
			inner: inner.promise,
		});
		pipe(collector.destination);
		const shell = collector.chunks.join('');
		// Control: an arm-root sheet registers ahead of its arm's use(), so the
		// outer boundary's sheet flushes with the shell head.
		expect(shell.match(/\/outer-late\.css/g) || []).toHaveLength(1);
		expect(shell).not.toContain('/inner-late.css');
		const shellChunkCount = collector.chunks.length;

		// The shell head belongs to the surrounding document; the body markup and
		// stream scripts land in the hydration container.
		const bodyStart = shell.indexOf('<div');
		document.head.insertAdjacentHTML('afterbegin', shell.slice(0, bodyStart));
		const c = streamContainer();
		c.innerHTML = shell.slice(bodyStart);

		outer.resolve('one');
		await new Promise((resolve) => setTimeout(resolve, 20));
		const outerWave = collector.chunks.slice(shellChunkCount).join('');
		expect(outerWave).toContain('outer-ready');
		// The inner boundary has NOT resolved, but its sheet was discovered while
		// rendering toward it — it hoists into the parent's reveal wave.
		expect(outerWave.match(/\/inner-late\.css/g) || []).toHaveLength(1);

		inner.resolve('two');
		const html = await collector.ended;
		expect(html.match(/\/inner-late\.css/g) || []).toHaveLength(1);

		c.insertAdjacentHTML('beforeend', collector.chunks.slice(shellChunkCount).join(''));
		activateStreamedMarkup(c);
		// The late sheet joins the precedence groups after the shell's (new group
		// appends after the last existing group).
		expect(sheetHrefs()).toEqual(['/outer-late.css', '/inner-late.css']);
		expect(c.querySelector('.outer-ready')?.textContent).toBe('one');
		expect(c.querySelector('.inner-ready')?.textContent).toBe('two');
	});

	// Per ReactDOMFloat-test.js:2350 — 'boundary stylesheet resource dependencies
	// hoist to a parent boundary when flushed inline': the inner boundary
	// resolves FIRST, so when its parent reveals, the complete child flushes
	// inline with the parent's wave and its sheet ships with that same wave.
	it("ships an inline-flushed complete child boundary's sheet with the parent's reveal", async () => {
		const outer = deferred<string>();
		const inner = deferred<string>();
		const collector = createPipeableCollector();
		const { pipe } = Server.renderToPipeableStream(srvStream.NestedLateBoundaries, {
			outer: outer.promise,
			inner: inner.promise,
		});
		pipe(collector.destination);
		const shell = collector.chunks.join('');
		expect(shell.match(/\/outer-late\.css/g) || []).toHaveLength(1);
		expect(shell).not.toContain('/inner-late.css');
		const shellChunkCount = collector.chunks.length;

		// The child resolves while its parent is still pending: it has no slot in
		// the document yet, so neither its content nor its sheet may stream.
		inner.resolve('two');
		await new Promise((resolve) => setTimeout(resolve, 20));
		const preReveal = collector.chunks.slice(shellChunkCount).join('');
		expect(preReveal).not.toContain('/inner-late.css');
		expect(preReveal).not.toContain('inner-ready');

		// The parent's resolution alone completes the response: the child flushes
		// inline within the parent's reveal, carrying its sheet exactly once.
		outer.resolve('one');
		const html = await collector.ended;
		const wave = collector.chunks.slice(shellChunkCount).join('');
		expect(wave).toContain('outer-ready');
		expect(wave).toContain('inner-ready');
		expect(wave.match(/\/inner-late\.css/g) || []).toHaveLength(1);
		expect(html.match(/\/inner-late\.css/g) || []).toHaveLength(1);

		// Browser simulation: the inline-flushed child's sheet joins the head
		// precedence groups after the shell's, and both contents are revealed.
		const bodyStart = shell.indexOf('<div');
		document.head.insertAdjacentHTML('afterbegin', shell.slice(0, bodyStart));
		const c = streamContainer();
		c.innerHTML = shell.slice(bodyStart);
		c.insertAdjacentHTML('beforeend', wave);
		activateStreamedMarkup(c);
		expect(sheetHrefs()).toEqual(['/outer-late.css', '/inner-late.css']);
		expect(c.querySelector('.outer-ready')?.textContent).toBe('one');
		expect(c.querySelector('.inner-ready')?.textContent).toBe('two');
	});

	it('does not re-ship a sheet already flushed with the shell', async () => {
		const d = deferred<string>();
		const collector = createPipeableCollector();
		const { pipe } = Server.renderToPipeableStream(srvStream.SharedSheetBoundary, {
			promise: d.promise,
		});
		pipe(collector.destination);
		expect(collector.chunks.join('').match(/\/shared\.css/g) || []).toHaveLength(1);
		d.resolve('go');
		const html = await collector.ended;
		// The late arm re-declares the same href; the whole response still
		// carries exactly one copy.
		expect(html.match(/\/shared\.css/g) || []).toHaveLength(1);
		expect(html).toContain('shared-value');
	});

	// Live client resource state can exist BEFORE a late chunk arrives (the app
	// hydrated and rendered a Float resource mid-stream). The streamed insert
	// must then go through that state so both sides keep deduping.
	it('routes late streamed sheets through live client resource state', async () => {
		const d = deferred<string>();
		const collector = createPipeableCollector();
		const { pipe } = Server.renderToPipeableStream(srvStream.GatedSheetBoundary, {
			promise: d.promise,
		});
		pipe(collector.destination);
		const c = streamContainer();
		c.innerHTML = collector.chunks.join('');
		const shellChunkCount = collector.chunks.length;
		activateStreamedMarkup(c);

		// A client render creates live Float state while the boundary is pending.
		const side = streamContainer();
		const clientRoot = createRoot(side);
		await act(() => clientRoot.render(SheetA, {}));
		expect(sheetHrefs()).toEqual(['/base.css']);

		d.resolve('x');
		await collector.ended;
		c.insertAdjacentHTML('beforeend', collector.chunks.slice(shellChunkCount).join(''));
		activateStreamedMarkup(c);
		// The streamed sheet appended into the live default precedence group…
		expect(sheetHrefs()).toEqual(['/base.css', '/gated-x.css']);

		// …and registered with client state: a client render of the same resource
		// adopts instead of duplicating.
		await act(() => clientRoot.render(GatedSheetContent, { name: 'x' }));
		expect(sheetHrefs()).toEqual(['/base.css', '/gated-x.css']);
		expect(document.head.querySelectorAll('style[data-href="gated-tokens"]')).toHaveLength(1);
		clientRoot.unmount();
	});
});

// Precedence GROUP order is part of the resource contract: groups appear in
// first-encounter order of tree DISCOVERY (what SSR serializes and React
// produces), not in the order component bodies happen to finish executing.
// Group order is CSS cascade order, so an inversion changes how equal-
// specificity rules across groups resolve.
describe('Float resources — precedence group discovery order', () => {
	const containers: HTMLElement[] = [];
	const roots: Array<{ unmount(): void }> = [];
	function mountInto(body: any, props: Record<string, unknown> = {}): void {
		const c = document.createElement('div');
		document.body.appendChild(c);
		containers.push(c);
		const root = createRoot(c);
		roots.push(root);
		root.render(body, props);
	}
	afterEach(() => {
		for (const r of roots.splice(0)) r.unmount();
		for (const c of containers.splice(0)) c.remove();
		document.head
			.querySelectorAll('[data-precedence], [data-oct-res]')
			.forEach((el) => el.remove());
		resetFloatResourceState();
	});

	const srvOrder = loadServerFixture(
		'packages/octane/tests/_fixtures/float-group-order.tsrx',
	) as Record<string, any>;

	it("a parent's group precedes its child component's group on a client mount", async () => {
		await act(() => mountInto(ParentChild));
		expect(sheetHrefs()).toEqual(['/parent-app.css', '/child-vendor.css']);
	});

	it("a suspended arm's group registers at reveal, after shell-rendered siblings", async () => {
		const d = deferred<string>();
		await act(() => mountInto(LateArmAfterSibling, { promise: d.promise }));
		// While the arm is pending, the root and sibling groups exist in
		// discovery order; the arm's group does not exist yet (the sheet is
		// discovered when its content renders — matching React, where a
		// suspended tree contributes no resources until it commits).
		expect(sheetHrefs()).toEqual(['/root-one.css', '/sibling.css']);
		await act(() => d.resolve('armed'));
		expect(sheetHrefs()).toEqual(['/root-one.css', '/sibling.css', '/arm-three.css']);
		expect(document.body.textContent).toContain('armed');
	});

	it('nested @try arms register their groups in discovery order across waves', async () => {
		const mid = deferred<string>();
		const deep = deferred<string>();
		await act(() => mountInto(NestedTryOrder, { mid: mid.promise, deep: deep.promise }));
		expect(sheetHrefs()).toEqual(['/outer-one.css']);
		await act(() => mid.resolve('m'));
		expect(sheetHrefs()).toEqual(['/outer-one.css', '/mid-two.css']);
		await act(() => deep.resolve('d'));
		expect(sheetHrefs()).toEqual(['/outer-one.css', '/mid-two.css', '/deep-three.css']);
		expect(document.body.textContent).toContain('d');
	});

	it('SSR serializes nested-tree groups in the same discovery order', async () => {
		const App = () => Server.createElement(srvOrder.ParentChild, null) as any;
		const r = await Server.renderToString(App as any);
		const app = r.html.indexOf('/parent-app.css');
		const vendor = r.html.indexOf('/child-vendor.css');
		expect(app).toBeGreaterThan(-1);
		expect(vendor).toBeGreaterThan(app);
	});

	it('a setup-local-computed href renders on the server and matches the client', async () => {
		// Server: the registration must not run before the local it reads is
		// initialized.
		const App = () => Server.createElement(srvOrder.LocalHref, { name: 'x' }) as any;
		const r = await Server.renderToString(App as any);
		expect(r.html.match(/\/x-dep\.css/g) || []).toHaveLength(1);
		expect(r.html).toContain('data-precedence="app"');

		// Client control: same component, same sheet.
		await act(() => mountInto(LocalHref, { name: 'x' }));
		expect(sheetHrefs()).toEqual(['/x-dep.css']);
	});

	it('mixed setup-local and static resources keep source order on both sides', async () => {
		// Registration order is group order. A static sheet declared AFTER a
		// setup-local-dependent one must not jump ahead of it on the server —
		// SSR and a client mount have to agree on the cascade.
		const App = () => Server.createElement(srvOrder.MixedLocalStatic, { name: 'x' }) as any;
		const r = await Server.renderToString(App as any);
		const dyn = r.html.indexOf('/x-first.css');
		const stat = r.html.indexOf('/second-static.css');
		expect(dyn).toBeGreaterThan(-1);
		expect(stat).toBeGreaterThan(dyn);

		await act(() => mountInto(MixedLocalStatic, { name: 'x' }));
		expect(sheetHrefs()).toEqual(['/x-first.css', '/second-static.css']);
	});

	it('an arm that fails while rendering a child keeps its already-registered sheet', async () => {
		// Resources are page-global and never removed; registration precedes
		// child evaluation on the server too, so client and server agree that a
		// failed arm's sheet stays.
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await act(() => mountInto(FailingArm, { arm: true }));
		} finally {
			errSpy.mockRestore();
		}
		expect(document.body.textContent).toContain('caught');
		expect(sheetHrefs()).toEqual(['/doomed.css']);
	});
});
