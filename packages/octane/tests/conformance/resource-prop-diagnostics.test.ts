import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	preconnect,
	prefetchDNS,
	preinit,
	preinitModule,
	preload,
	preloadModule,
	resetFloatResourceState,
} from '../../src/index.js';
import * as Server from 'octane/server';

type HintSurface = {
	preconnect: typeof preconnect;
	prefetchDNS: typeof prefetchDNS;
	preinit: typeof preinit;
	preinitModule: typeof preinitModule;
	preload: typeof preload;
	preloadModule: typeof preloadModule;
};

const SURFACES: readonly { name: string; hints: HintSurface }[] = [
	{
		name: 'client',
		hints: { preconnect, prefetchDNS, preinit, preinitModule, preload, preloadModule },
	},
	{ name: 'server', hints: Server },
];
let nextHintIdentity = 0;

afterEach(() => {
	document.head
		.querySelectorAll('[data-oct-hint], [data-precedence], [data-oct-res]')
		.forEach((element) => element.remove());
	resetFloatResourceState();
	vi.restoreAllMocks();
});

describe.each(SURFACES)('$name resource hint prop diagnostics', ({ hints }) => {
	// Per ReactDOMFloat-test.js:6137 and ReactDOMFloat.js:104. React publishes
	// one combined message naming every invalid argument rather than masking the
	// malformed options behind the invalid href.
	it('reports invalid preload href and options together without creating a hint', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		hints.preload(undefined as unknown as string, null as any);
		expect(error).toHaveBeenCalledOnce();
		expect(String(error.mock.calls[0][0])).toContain('preload()');
		expect(String(error.mock.calls[0][0])).toContain('href');
		expect(String(error.mock.calls[0][0])).toContain('options');
		expect(document.head.querySelector('[data-oct-hint]')).toBeNull();
	});

	// Per ReactDOMFloat-test.js:6137 and ReactDOMFloat.js:114. Options must be
	// objects and `as` must be a non-empty resource destination string.
	it.each([
		{ options: true, detail: 'options' },
		{ options: 'script', detail: 'options' },
		{ options: {}, detail: 'as' },
		{ options: { as: '' }, detail: 'as' },
		{ options: { as: 12 }, detail: 'as' },
	])('explains invalid preload $detail options', ({ options, detail }) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		hints.preload('/invalid-preload.css', options as any);
		expect(error).toHaveBeenCalledOnce();
		expect(String(error.mock.calls[0][0])).toContain('preload()');
		expect(String(error.mock.calls[0][0])).toContain(detail);
		expect(document.head.querySelector('[href="/invalid-preload.css"]')).toBeNull();
	});

	// Per ReactDOMFloat-test.js:6733 and ReactDOMFloat.js:175. Distinguish a
	// malformed options object from an unsupported preinit destination.
	it.each([
		{ options: null, detail: 'options' },
		{ options: 2, detail: 'options' },
		{ options: { as: '' }, detail: 'style' },
		{ options: { as: 'font' }, detail: 'script' },
		{ options: { as: false }, detail: 'style' },
	])(
		'explains the invalid preinit option $detail and preserves the no-op',
		({ options, detail }) => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			hints.preinit('/invalid-preinit.css', options as any);
			expect(error).toHaveBeenCalledOnce();
			expect(String(error.mock.calls[0][0])).toContain('preinit()');
			expect(String(error.mock.calls[0][0])).toContain(detail);
			expect(document.head.querySelector('[href="/invalid-preinit.css"]')).toBeNull();
		},
	);

	// Per ReactDOMFloat-test.js:6407 and ReactDOMFloat.js:141. Optional module
	// preload options must be an object and an explicitly supplied `as` a string.
	it.each([
		{ options: true, detail: 'options' },
		{ options: 'script', detail: 'options' },
		{ options: { as: true }, detail: 'as' },
		{ options: { as: 3 }, detail: 'as' },
	])(
		'warns for invalid module preload $detail options while preserving the hint',
		({ options, detail }) => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			const href = `/invalid-module-${++nextHintIdentity}.mjs`;
			hints.preloadModule(href, options as any);
			expect(error).toHaveBeenCalledOnce();
			expect(String(error.mock.calls[0][0])).toContain('preloadModule()');
			expect(String(error.mock.calls[0][0])).toContain(detail);
			if (hints.preloadModule === preloadModule) {
				const hint = document.head.querySelector(`[href="${href}"]`);
				expect(hint).not.toBeNull();
				expect(hint!.hasAttribute('as')).toBe(false);
			}
		},
	);

	// Per ReactDOMFloat-test.js:7113 and ReactDOMFloat.js:240. Module preinit
	// accepts absent/script destinations only, with exact malformed-value help.
	it.each([
		{ options: true, detail: 'options' },
		{ options: 'script', detail: 'options' },
		{ options: { as: 'style' }, detail: 'script' },
		{ options: { as: false }, detail: 'script' },
	])(
		'rejects invalid module preinit $detail options without executing a module',
		({ options, detail }) => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			hints.preinitModule('/invalid-module-init.mjs', options as any);
			expect(error).toHaveBeenCalledOnce();
			expect(String(error.mock.calls[0][0])).toContain('preinitModule()');
			expect(String(error.mock.calls[0][0])).toContain(detail);
			expect(document.head.querySelector('[src="/invalid-module-init.mjs"]')).toBeNull();
		},
	);

	// Per ReactDOMFloat-test.js:5927 and ReactDOMFloat.js:62. Connection options
	// are object-shaped and crossOrigin, when provided, is a string.
	it.each([
		{ options: true, detail: 'options' },
		{ options: 'anonymous', detail: 'options' },
		{ options: {}, detail: 'crossOrigin' },
		{ options: { crossOrigin: true }, detail: 'crossOrigin' },
		{ options: { crossOrigin: 42 }, detail: 'crossOrigin' },
	])('rejects invalid preconnect $detail values', ({ options, detail }) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const href = `https://resource-diagnostics-${++nextHintIdentity}.invalid`;
		hints.preconnect(href, options as any);
		expect(error).toHaveBeenCalledOnce();
		expect(String(error.mock.calls[0][0])).toContain('preconnect()');
		expect(String(error.mock.calls[0][0])).toContain(detail);
		if (hints.preconnect === preconnect) {
			const hint = document.head.querySelector(`[href="${href}"]`);
			expect(hint).not.toBeNull();
			expect(hint!.hasAttribute('crossorigin')).toBe(false);
		}
	});

	// Per ReactDOMFloat-test.js:5541 and ReactDOMFloat.js:29. DNS lookups never
	// use CORS; a second argument is unsupported even when it is an object.
	it('explains why a DNS-prefetch crossOrigin argument has no effect', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		(hints.prefetchDNS as (...args: unknown[]) => void)('https://dns-resource.invalid', {
			crossOrigin: 'anonymous',
		});
		expect(error).toHaveBeenCalledOnce();
		expect(String(error.mock.calls[0][0])).toContain('prefetchDNS()');
		expect(String(error.mock.calls[0][0])).toContain('crossOrigin');
		expect(String(error.mock.calls[0][0])).toContain('DNS');
	});

	// Per ReactDOMFloat.js:145, :229. Optional null and undefined preserve the
	// normal default-script behavior; preloadModule supports future destinations.
	it('accepts omitted module options and valid future preload destinations silently', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		hints.preloadModule('/valid-module.mjs', { as: 'worker' });
		hints.preinitModule('/valid-module-init.mjs');
		hints.preconnect('https://valid-resource.invalid');
		hints.preconnect('https://valid-cors.invalid', { crossOrigin: '' });
		expect(error).not.toHaveBeenCalled();
	});

	// ReactDOMFloat.js treats null module options exactly like omitted options:
	// they produce no diagnostic and preinit still executes the default script.
	it('accepts null module options and initializes the default script', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const preloadHref = `/null-module-preload-${++nextHintIdentity}.mjs`;
		const preinitHref = `/null-module-init-${++nextHintIdentity}.mjs`;
		hints.preloadModule(preloadHref, null as any);
		hints.preinitModule(preinitHref, null as any);
		expect(error).not.toHaveBeenCalled();
		if (hints.preloadModule === preloadModule) {
			expect(
				document.head.querySelector(`link[rel="modulepreload"][href="${preloadHref}"]`),
			).not.toBeNull();
			expect(
				document.head.querySelector(`script[type="module"][src="${preinitHref}"]`),
			).not.toBeNull();
		}
	});

	it('keeps null-option server module hints in rendered output', () => {
		if (hints.preloadModule !== Server.preloadModule) return;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const preloadHref = `/null-server-preload-${++nextHintIdentity}.mjs`;
		const preinitHref = `/null-server-init-${++nextHintIdentity}.mjs`;
		const App = () => {
			Server.preloadModule(preloadHref, null as any);
			Server.preinitModule(preinitHref, null as any);
			return Server.createElement('div', null, 'ok');
		};
		const html = Server.renderToString(App).html;
		expect(html).toContain(`href="${preloadHref}"`);
		expect(html).toContain(`src="${preinitHref}"`);
		expect(error).not.toHaveBeenCalled();
	});

	// Runtime hint APIs are callable independently of compiler mode; actual
	// production NODE_ENV and optimized bundles must strip every new diagnostic.
	it('keeps malformed hint calls silent when NODE_ENV is production', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const previous = process.env.NODE_ENV;
		process.env.NODE_ENV = 'production';
		try {
			hints.preload('/production.css', true as any);
			hints.preinit('/production.css', null as any);
			hints.preloadModule('/production.mjs', true as any);
			hints.preinitModule('/production.mjs', true as any);
			hints.preconnect('https://production.invalid', { crossOrigin: true } as any);
			(hints.prefetchDNS as (...args: unknown[]) => void)('https://production-dns.invalid', {});
		} finally {
			process.env.NODE_ENV = previous;
		}
		expect(error).not.toHaveBeenCalled();
	});
});
