import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadServerFixture } from '../_server-fixture';
import { BlockHost, DynamicTag, PureHost, SvgHost } from './_fixtures/host-tag-case.tsrx';

// HTML tag names are ASCII case-insensitive. The server writes an uppercase
// descriptor tag, the parser lowercases it, and `createElement('DIV')` builds a
// `div` on the client too. The client must match its descriptor against that
// element the same way: adopt it on hydration, and keep it across updates so
// focus, selection, and scroll survive. SVG names stay case-sensitive.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/host-tag-case.tsrx');
const server = loadServerFixture(FIXTURE, {
	id: 'host-tag-case.tsrx',
	compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
});

const SVG_NS = 'http://www.w3.org/2000/svg';

const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
	vi.restoreAllMocks();
});

function createContainer(): HTMLElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	containers.push(container);
	return container;
}

function renderServer(name: string, props: Record<string, unknown>): HTMLElement {
	const container = createContainer();
	container.innerHTML = ServerRT.renderToString(server[name], props).html;
	return container;
}

// Recoverable errors arrive in a microtask, so callers settle with act() before
// asserting on them. Only hydration diagnostics count: a DEV authoring warning
// about tag casing would fire for a client-only mount too.
function hydrate(container: HTMLElement, client: any, props: Record<string, unknown>) {
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const root = hydrateRoot(container, client, props, {
		onRecoverableError: (error) => recoverable.push(error),
	});
	const reports = () => errors.mock.calls.filter((call) => /hydration/i.test(String(call[0])));
	return { root, recoverable, reports };
}

const HTML_CASES = [
	{
		name: 'PureHost',
		client: PureHost,
		initial: { value: 'A' },
		next: { value: 'B' },
		text: ['hello A', 'hello B'],
	},
	{
		name: 'BlockHost',
		client: BlockHost,
		initial: { text: 'A' },
		next: { text: 'B' },
		text: ['A', 'B'],
	},
] as const;

describe('an HTML host descriptor tag in any casing', () => {
	it.each(HTML_CASES.flatMap((c) => ['div', 'DIV', 'Div', 'dIV'].map((tag) => ({ ...c, tag }))))(
		'$name <$tag> adopts the server element without a mismatch and keeps it across updates',
		async ({ name, client, initial, next, text, tag }) => {
			const container = renderServer(name, { tag, ...initial });
			const el = container.querySelector('#el') as HTMLElement;
			const label = container.querySelector('#label');
			expect(el.localName).toBe('div');

			const { root, recoverable, reports } = hydrate(container, client, { tag, ...initial });
			try {
				await act(() => {});
				expect(recoverable).toEqual([]);
				expect(reports()).toEqual([]);
				expect(container.querySelector('#el')).toBe(el);
				expect(el.textContent).toBe(text[0]);
				if (label !== null) expect(container.querySelector('#label')).toBe(label);

				await act(() => root.render(client, { tag, ...next }));
				expect(container.querySelector('#el')).toBe(el);
				expect(el.textContent).toBe(text[1]);
				if (label !== null) expect(container.querySelector('#label')).toBe(label);
				expect(recoverable).toEqual([]);
				expect(reports()).toEqual([]);
			} finally {
				root.unmount();
			}
		},
	);

	it.each(HTML_CASES)(
		'$name <DIV> keeps its client-built element and focus across updates',
		(c) => {
			const container = createContainer();
			const root = createRoot(container);
			try {
				flushSync(() => root.render(c.client, { tag: 'DIV', ...c.initial }));
				const el = container.querySelector('#el') as HTMLElement;
				expect(el.localName).toBe('div');
				el.tabIndex = 0;
				el.focus();
				expect(document.activeElement).toBe(el);

				flushSync(() => root.render(c.client, { tag: 'DIV', ...c.next }));
				expect(container.querySelector('#el')).toBe(el);
				expect(el.textContent).toBe(c.text[1]);
				expect(document.activeElement).toBe(el);
			} finally {
				root.unmount();
			}
		},
	);

	it('a dynamic template tag <H1> adopts the server element without a mismatch', async () => {
		const container = renderServer('DynamicTag', { tag: 'H1', text: 'A' });
		const el = container.querySelector('#el') as HTMLElement;
		expect(el.localName).toBe('h1');

		const { root, recoverable, reports } = hydrate(container, DynamicTag, { tag: 'H1', text: 'A' });
		try {
			await act(() => {});
			expect(recoverable).toEqual([]);
			expect(reports()).toEqual([]);
			expect(container.querySelector('#el')).toBe(el);

			await act(() => root.render(DynamicTag, { tag: 'H1', text: 'B' }));
			expect(container.querySelector('#el')).toBe(el);
			expect(el.textContent).toBe('B');
		} finally {
			root.unmount();
		}
	});
});

describe('SVG host descriptor tags stay case-sensitive', () => {
	it('mixed-case SVG tags and an uppercase HTML child of foreignObject hydrate and update in place', async () => {
		const container = renderServer('SvgHost', { tag: 'P', value: 'A' });
		const fo = container.querySelector('#fo')!;
		const grad = container.querySelector('#grad')!;
		const stop = grad.firstElementChild!;
		const el = container.querySelector('#el')!;
		expect([fo.localName, fo.namespaceURI]).toEqual(['foreignObject', SVG_NS]);
		expect([grad.localName, grad.namespaceURI]).toEqual(['linearGradient', SVG_NS]);
		expect([stop.localName, stop.namespaceURI]).toEqual(['stop', SVG_NS]);
		expect([el.localName, el.namespaceURI]).toEqual(['p', 'http://www.w3.org/1999/xhtml']);

		const { root, recoverable, reports } = hydrate(container, SvgHost, { tag: 'P', value: 'A' });
		try {
			await act(() => {});
			expect(recoverable).toEqual([]);
			expect(reports()).toEqual([]);

			await act(() => root.render(SvgHost, { tag: 'P', value: 'B' }));
			expect(container.querySelector('#fo')).toBe(fo);
			expect(container.querySelector('#grad')).toBe(grad);
			expect(grad.firstElementChild).toBe(stop);
			expect(stop.getAttribute('offset')).toBe('1');
			expect(container.querySelector('#el')).toBe(el);
			expect(el.textContent).toBe('hello B');
			expect(recoverable).toEqual([]);
			expect(reports()).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	it('an SVG element is rebuilt when the descriptor tag differs from it only in case', () => {
		const container = createContainer();
		const root = createRoot(container);
		try {
			flushSync(() => root.render(SvgHost, { tag: 'p', value: 'A', stopTag: 'stop' }));
			const stop = container.querySelector('#grad')!.firstElementChild!;
			expect([stop.localName, stop.namespaceURI]).toEqual(['stop', SVG_NS]);

			flushSync(() => root.render(SvgHost, { tag: 'p', value: 'A', stopTag: 'STOP' }));
			const next = container.querySelector('#grad')!.firstElementChild!;
			expect(next).not.toBe(stop);
			expect([next.localName, next.namespaceURI]).toEqual(['STOP', SVG_NS]);
		} finally {
			root.unmount();
		}
	});
});
