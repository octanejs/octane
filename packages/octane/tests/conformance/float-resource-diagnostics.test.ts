import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, preload, resetFloatResourceState } from '../../src/index.js';
import * as Server from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import { collectPipeableStream } from '../_server-stream.js';
import {
	DynamicPrecedenceResourceControl,
	PrecedenceResourceControl,
	PrecedenceWithoutHref,
	PrecedenceWithBothHandlers,
	PrecedenceWithDisabledFalse,
	PrecedenceWithDisabledTrue,
	PrecedenceWithEmptyHref,
	PrecedenceWithErrorHandler,
	PrecedenceWithLoadHandler,
	PreloadedStyleResource,
	StyleResourceWithoutWhitespace,
	StyleResourceWithWhitespace,
} from '../_fixtures/float-evidence-1.tsrx';

const productionCompile = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';
const server = loadServerFixture('packages/octane/tests/_fixtures/float-evidence-1.tsrx', {
	compileOptions: { dev: !productionCompile },
}) as Record<string, any>;

const precedenceCases = [
	{
		name: 'a missing href',
		component: PrecedenceWithoutHref,
		serverComponent: 'PrecedenceWithoutHref',
		props: {},
		message: 'a non-empty string `href`',
	},
	{
		name: 'an empty href',
		component: PrecedenceWithEmptyHref,
		serverComponent: 'PrecedenceWithEmptyHref',
		props: {},
		message: 'an empty `href`',
	},
	{
		name: 'an onLoad handler',
		component: PrecedenceWithLoadHandler,
		serverComponent: 'PrecedenceWithLoadHandler',
		props: { onLoad: () => {} },
		message: '`onLoad`',
	},
	{
		name: 'an onError handler',
		component: PrecedenceWithErrorHandler,
		serverComponent: 'PrecedenceWithErrorHandler',
		props: { onError: () => {} },
		message: '`onError`',
	},
	{
		name: 'both loading handlers',
		component: PrecedenceWithBothHandlers,
		serverComponent: 'PrecedenceWithBothHandlers',
		props: { onLoad: () => {}, onError: () => {} },
		message: '`onLoad` and `onError`',
	},
	{
		name: 'disabled={false}',
		component: PrecedenceWithDisabledFalse,
		serverComponent: 'PrecedenceWithDisabledFalse',
		props: {},
		message: '`disabled`',
	},
	{
		name: 'a truthy disabled prop',
		component: PrecedenceWithDisabledTrue,
		serverComponent: 'PrecedenceWithDisabledTrue',
		props: {},
		message: '`disabled`',
	},
] as const;

const roots: Array<{ unmount(): void }> = [];
const containers: HTMLElement[] = [];

function mount(component: any, props: any = {}): HTMLElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	containers.push(container);
	const root = createRoot(container);
	roots.push(root);
	root.render(component, props);
	return container;
}

function warningMessages(error: ReturnType<typeof vi.spyOn>): string[] {
	return error.mock.calls.map((call) => String(call[0]));
}

function expectDevelopmentWarning(
	messages: string[],
	fragment: string,
	secondaryFragment?: string,
): void {
	if (productionCompile) {
		expect(messages).toEqual([]);
		return;
	}
	expect(messages).toHaveLength(secondaryFragment === undefined ? 1 : 2);
	expect(messages[0]).toContain(fragment);
	if (secondaryFragment !== undefined) expect(messages[1]).toContain(secondaryFragment);
}

afterEach(() => {
	for (const root of roots.splice(0)) root.unmount();
	for (const container of containers.splice(0)) container.remove();
	document.head
		.querySelectorAll('[data-precedence], [data-oct-hint], [data-oct-res]')
		.forEach((element) => element.remove());
	resetFloatResourceState();
	vi.restoreAllMocks();
});

describe('React Float stylesheet resource diagnostics', () => {
	// Per ReactDOMFloat-test.js:7898 — every disqualifying prop keeps its
	// stylesheet in the authored position, including disabled={false}.
	it.each(precedenceCases)('keeps a precedence link with $name inline on the client', (variant) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const container = mount(variant.component, variant.props);
		const link = container.querySelector('.invalid-precedence-host > link');

		expect(link).not.toBeNull();
		expect(link?.getAttribute('rel')).toBe('stylesheet');
		expect(link?.hasAttribute('data-precedence')).toBe(false);
		expect(document.head.querySelector('[data-precedence]')).toBeNull();
		expectDevelopmentWarning(
			warningMessages(error),
			variant.message,
			variant.name === 'an empty href' ? 'An empty string was passed to the `href`' : undefined,
		);
	});

	// Per ReactDOMFloat-test.js:7898 — server rendering must retain the ordinary
	// element and describe the same resource-invalidating prop.
	it.each(precedenceCases)('keeps a precedence link with $name inline on the server', (variant) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(server[variant.serverComponent], variant.props).html;

		expect(html).toMatch(/<section class="invalid-precedence-host"><link /);
		expect(html).not.toContain('data-precedence=');
		expectDevelopmentWarning(
			warningMessages(error),
			variant.message,
			variant.name === 'an empty href' ? 'An empty string was passed to the `href`' : undefined,
		);
	});

	// Per ReactDOMFloat-test.js:7898 — a valid precedence stylesheet remains a
	// hoisted, deduplicated resource without a development warning.
	it('preserves valid stylesheet resource hoisting without a warning', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const container = mount(PrecedenceResourceControl);

		expect(container.querySelector('link')).toBeNull();
		expect(document.head.querySelector('link[href="/precedence-valid.css"]')).not.toBeNull();
		expect(warningMessages(error)).toEqual([]);
	});

	// Per ReactDOMFloat-test.js:7898 — rejecting statically empty stylesheet
	// hrefs must not declassify a valid href that is only known at runtime.
	it('continues hoisting stylesheets with a valid dynamic href on the client', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const container = mount(DynamicPrecedenceResourceControl, {
			href: '/dynamic-precedence-client.css',
		});

		expect(container.querySelector('link')).toBeNull();
		expect(
			document.head.querySelector('link[href="/dynamic-precedence-client.css"][data-precedence]'),
		).not.toBeNull();
		expect(warningMessages(error)).toEqual([]);
	});

	// Per ReactDOMFloat-test.js:7898 — server resource ownership uses the same
	// static classification when a valid stylesheet href is provided as a prop.
	it('continues hoisting stylesheets with a valid dynamic href on the server', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(server.DynamicPrecedenceResourceControl, {
			href: '/dynamic-precedence-server.css',
		}).html;

		expect(html).toMatch(
			/<link rel="stylesheet" href="\/dynamic-precedence-server\.css" data-precedence="default"/,
		);
		expect(html).toContain('<section class="dynamic-precedence-host"></section>');
		expect(warningMessages(error)).toEqual([]);
	});

	// Per ReactDOMFloat-test.js:4834 — inline CSS cannot consume a stylesheet
	// preload, so the author needs guidance while both head entries remain live.
	it('warns when a client style resource collides with a stylesheet preload', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		mount(PreloadedStyleResource);

		expect(
			document.head.querySelector('link[rel="preload"][href="/inline-collision.css"]'),
		).not.toBeNull();
		expect(document.head.querySelector('style[data-href="/inline-collision.css"]')).not.toBeNull();
		expectDevelopmentWarning(warningMessages(error), 'preload');
	});

	// Per ReactDOMFloat-test.js:4834 — an inline style cannot fulfill an external
	// stylesheet preload, regardless of which resource reaches the client first.
	it('preserves a later stylesheet preload alongside an existing inline style resource', () => {
		mount(StyleResourceWithoutWhitespace);
		const inlineStyle = document.head.querySelector('style[data-href="inline-style-key"]');

		expect(inlineStyle).not.toBeNull();
		preload('inline-style-key', { as: 'style' });
		preload('inline-style-key', { as: 'style' });

		const preloads = document.head.querySelectorAll('link[rel="preload"][href="inline-style-key"]');
		expect(preloads).toHaveLength(1);
		expect(preloads[0].getAttribute('as')).toBe('style');
		expect(document.head.querySelector('style[data-href="inline-style-key"]')).toBe(inlineStyle);
	});

	// Per ReactDOMFloat-test.js:4834 — a server-authored style remains distinct
	// from its preload even when its identity cannot safely enter a CSS selector.
	it('preserves a preload for an SSR-seeded inline style whose href contains selector characters', () => {
		resetFloatResourceState();
		const href = 'seeded"]weird.css';
		const inlineStyle = document.createElement('style');
		inlineStyle.setAttribute('data-precedence', 'default');
		inlineStyle.setAttribute('data-href', href);
		inlineStyle.textContent = 'body { color: red; }';
		document.head.appendChild(inlineStyle);

		preload(href, { as: 'style' });
		preload(href, { as: 'style' });

		const preloads = Array.from(document.head.querySelectorAll('link[rel="preload"]')).filter(
			(element) => element.getAttribute('href') === href,
		);
		expect(preloads).toHaveLength(1);
		expect(preloads[0].getAttribute('as')).toBe('style');
		expect(
			Array.from(document.head.querySelectorAll('style[data-precedence]')).find(
				(element) => element.getAttribute('data-href') === href,
			),
		).toBe(inlineStyle);
	});

	// Per ReactDOMFloat-test.js:4834 — external stylesheets can fulfill a
	// matching preload, so the inline-style exception must not duplicate them.
	it('suppresses a later stylesheet preload when an external stylesheet already exists', () => {
		mount(PrecedenceResourceControl);
		const stylesheet = document.head.querySelector(
			'link[rel="stylesheet"][href="/precedence-valid.css"]',
		);

		expect(stylesheet).not.toBeNull();
		preload('/precedence-valid.css', { as: 'style' });

		expect(
			document.head.querySelector('link[rel="preload"][href="/precedence-valid.css"]'),
		).toBeNull();
		expect(
			document.head.querySelector('link[rel="stylesheet"][href="/precedence-valid.css"]'),
		).toBe(stylesheet);
	});

	// Per ReactDOMFloat-test.js:4834 — Fizz retains the inline style and its
	// incompatible preload; reporting the collision cannot coalesce either away.
	it('warns when streaming SSR discovers a style resource after a matching preload', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { html, errors } = await collectPipeableStream(server.PreloadedStyleResource);

		expect(errors).toEqual([]);
		expect(html).toMatch(/<link rel="preload"[^>]*href="\/inline-collision\.css"/);
		expect(html).toMatch(/<style[^>]*data-href="\/inline-collision\.css"/);
		expectDevelopmentWarning(warningMessages(error), 'preload');
	});

	// Per ReactDOMFloat-test.js:4834 — the incompatible-inline-style exception
	// must not change the existing external stylesheet/preload deduplication.
	it('continues to suppress an unnecessary preload for an existing external stylesheet', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(server.PreloadedExternalStylesheet).html;

		expect(html).toMatch(/<link rel="stylesheet" href="\/external-control\.css"/);
		expect(html).not.toContain('rel="preload"');
		expect(warningMessages(error)).toEqual([]);
	});

	// Per ReactDOMFloat-test.js:8578 — a style resource's href is its identity,
	// so spaces can prevent its server markup from being adopted on hydration.
	it('warns when an SSR style resource href contains whitespace', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(server.StyleResourceWithWhitespace).html;

		expect(html).toContain('data-href="inline style key"');
		expectDevelopmentWarning(warningMessages(error), 'inline style key');
	});

	// Per ReactDOMFloat-test.js:8578 — ordinary, whitespace-free resource keys
	// keep their original rendering behavior and do not emit a diagnostic.
	it('keeps whitespace-free SSR style resource hrefs silent', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(server.StyleResourceWithoutWhitespace).html;

		expect(html).toContain('data-href="inline-style-key"');
		expect(warningMessages(error)).toEqual([]);
	});

	// Per ReactDOMFloat-test.js:8578 — the space diagnostic is an SSR/hydration
	// constraint; a client-only inline style resource does not warn.
	it('does not warn for a whitespace-bearing style resource on a client-only mount', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		mount(StyleResourceWithWhitespace);

		expect(document.head.querySelector('style[data-href="inline style key"]')).not.toBeNull();
		expect(warningMessages(error)).toEqual([]);
	});
});
