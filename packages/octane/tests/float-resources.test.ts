// React Float parity: <link rel="stylesheet" href precedence> and
// <script async src> rendered in components are RESOURCES, not per-site head
// elements — hoisted to document.head, deduped by href/src identity across the
// whole page, stylesheets ordered by precedence group (first-encounter group
// order, appended within a group), and retained after unmount (React never
// removes a resource: unloading styles or re-running scripts is unsafe).
// Suspend-until-loaded ("suspensey" commit) is intentionally NOT part of this
// contract — Octane documents that as out of scope.
// Links WITHOUT precedence keep the existing per-site head-element behavior.
import { describe, it, expect, afterEach } from 'vitest';
import { act, createRoot, resetFloatResourceState } from '../src/index.js';
import * as Server from 'octane/server';
import { loadServerFixture } from './_server-fixture.js';
import { collectPipeableStream } from './_server-stream.js';
import {
	SheetA,
	SheetADuplicate,
	SheetHigh,
	SheetLate,
	PlainLink,
	AsyncScript,
	AsyncScriptDuplicate,
	ReturnScript,
	ReturnSheet,
	ToggleHost,
	setSheetVisible,
} from './_fixtures/float-resources.tsrx';

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
