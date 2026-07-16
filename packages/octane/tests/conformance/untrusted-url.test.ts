import { describe, expect, it, vi } from 'vitest';
import * as ClientRT from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { prerender } from 'octane/static';
import { loadServerFixture } from '../_server-fixture.js';
import { collectPipeableStream, collectReadableStream } from '../_server-stream.js';
import * as client from './_fixtures/untrusted-url.tsrx';

const FIXTURE = 'packages/octane/tests/conformance/_fixtures/untrusted-url.tsrx';
const server = loadServerFixture(FIXTURE);

const EXPECTED_SAFE_URL =
	"javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')";
const UNSAFE_URL = 'javascript:notfine';
const SAFE_SERVER_URL = 'https://server.example/';

type MatrixMode =
	| 'client'
	| 'server-string'
	| 'server-stream'
	| 'hydrate-match'
	| 'hydrate-mismatch';

interface MatrixObservation {
	mode: MatrixMode;
	variant: string;
	root: ParentNode;
	html: string;
	serverProps?: any;
	clientProps?: any;
}

interface MatrixCase {
	component: string;
	props: () => any;
	mismatchServerProps: () => any;
	assert: (observation: MatrixObservation) => void;
	modes?: MatrixMode[];
	/** Host context needed to parse the server HTML before hydration. */
	containerTag?: string;
	/** Some de-opt hydration routes patch without publishing the DEV diagnostic. */
	expectMismatchWarning?: boolean;
}

function parseHtml(html: string): DocumentFragment {
	const template = document.createElement('template');
	template.innerHTML = html;
	return template.content;
}

function expectAttr(root: ParentNode, selector: string, name: string, value: string): void {
	const element = root.querySelector(selector);
	expect(element, `missing ${selector}`).not.toBeNull();
	expect(element!.getAttribute(name)).toBe(value);
}

function expectCaseFoldedAttr(
	root: ParentNode,
	selector: string,
	name: string,
	value: string,
): void {
	const element = root.querySelector(selector);
	expect(element, `missing ${selector}`).not.toBeNull();
	const attribute = Array.from(element!.attributes).find(
		(candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
	);
	expect(attribute?.value).toBe(value);
}

function expectHtmlAttr(html: string, id: string, name: string, value: string): void {
	const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	expect(html).toMatch(new RegExp(`<[^>]+id=["']${id}["'][^>]+${name}=["']${escaped}["']`));
}

function renderDetached(component: any, props: any, containerTag = 'div') {
	const container = document.createElement(containerTag);
	const root = ClientRT.createRoot(container);
	root.render(component, props);
	ClientRT.flushSync(() => {});
	return { container, root };
}

function assertServerObservation(
	entry: MatrixCase,
	mode: 'server-string' | 'server-stream',
	variant: string,
	html: string,
	props: any,
): void {
	entry.assert({ mode, variant, root: parseHtml(html), html, serverProps: props });
}

async function assertHydrationObservation(
	entry: MatrixCase,
	mode: 'hydrate-match' | 'hydrate-mismatch',
): Promise<void> {
	const serverProps = mode === 'hydrate-match' ? entry.props() : entry.mismatchServerProps();
	const clientProps = entry.props();
	const html = ServerRT.renderToString(server[entry.component], serverProps).html;
	const container = document.createElement(entry.containerTag ?? 'div');
	container.innerHTML = html;
	const before = container.firstElementChild;
	const error = vi.spyOn(console, 'error').mockImplementation(() => {});
	let root: ReturnType<typeof ClientRT.hydrateRoot> | undefined;
	try {
		root = ClientRT.hydrateRoot(container, (client as any)[entry.component], clientProps);
		ClientRT.flushSync(() => {});
		// URL mismatch recovery must patch the adopted host, never rebuild it.
		expect(container.firstElementChild).toBe(before);
		entry.assert({
			mode,
			variant: mode,
			root: container,
			html: container.innerHTML,
			serverProps,
			clientProps,
		});
		const diagnostics = error.mock.calls.map((call) => call.map(String).join(' '));
		const mismatchDiagnostics = diagnostics.filter((message) =>
			message.includes('hydration mismatch'),
		);
		if (
			mode === 'hydrate-match' ||
			process.env.OCTANE_TEST_COMPILE_MODE === 'prod' ||
			entry.expectMismatchWarning === false
		) {
			if (entry.expectMismatchWarning !== false) expect(mismatchDiagnostics).toHaveLength(0);
		} else {
			expect(mismatchDiagnostics.length).toBeGreaterThan(0);
		}
		expect(diagnostics.filter((message) => !message.includes('hydration mismatch'))).toEqual([]);
	} finally {
		root?.unmount();
		error.mockRestore();
	}
}

/**
 * React's `itRenders` matrix, mapped to Octane's public APIs. Every portable
 * case runs a detached clean client render, all three buffered/static server
 * APIs, both stream APIs, matching hydration, and mismatched hydration where
 * an unsafe client value must still be sanitized before comparison/write.
 */
async function expectInRenderMatrix(entry: MatrixCase): Promise<void> {
	const modes =
		entry.modes ??
		(['client', 'server-string', 'server-stream', 'hydrate-match', 'hydrate-mismatch'] as const);
	if (modes.includes('client')) {
		const props = entry.props();
		const rendered = renderDetached((client as any)[entry.component], props, entry.containerTag);
		try {
			entry.assert({
				mode: 'client',
				variant: 'createRoot',
				root: rendered.container,
				html: rendered.container.innerHTML,
				clientProps: props,
			});
		} finally {
			rendered.root.unmount();
		}
	}

	if (modes.includes('server-string')) {
		let props = entry.props();
		let html = ServerRT.renderToString(server[entry.component], props).html;
		assertServerObservation(entry, 'server-string', 'renderToString', html, props);

		props = entry.props();
		html = ServerRT.renderToStaticMarkup(server[entry.component], props).html;
		assertServerObservation(entry, 'server-string', 'renderToStaticMarkup', html, props);

		props = entry.props();
		html = (await prerender(server[entry.component], props)).html;
		assertServerObservation(entry, 'server-string', 'prerender', html, props);
	}

	if (modes.includes('server-stream')) {
		let props = entry.props();
		let html = (await collectPipeableStream(server[entry.component], props)).html;
		assertServerObservation(entry, 'server-stream', 'renderToPipeableStream', html, props);

		props = entry.props();
		html = (await collectReadableStream(server[entry.component], props)).html;
		assertServerObservation(entry, 'server-stream', 'renderToReadableStream', html, props);
	}

	if (modes.includes('hydrate-match')) await assertHydrationObservation(entry, 'hydrate-match');
	if (modes.includes('hydrate-mismatch'))
		await assertHydrationObservation(entry, 'hydrate-mismatch');
}

function urlCase(component: string, selector: string, name: string, url = UNSAFE_URL): MatrixCase {
	return {
		component,
		props: () => ({ url }),
		mismatchServerProps: () => ({ url: SAFE_SERVER_URL }),
		assert(observation) {
			expectAttr(observation.root, selector, name, EXPECTED_SAFE_URL);
		},
	};
}

describe('conformance: ReactDOMServerIntegrationUntrustedURL', () => {
	// Per ReactDOMServerIntegrationUntrustedURL-test.js:53.
	it('a http link with the word javascript in it', async () => {
		const url = 'http://javascript:0/thisisfine';
		await expectInRenderMatrix({
			component: 'DynamicLink',
			props: () => ({ url }),
			mismatchServerProps: () => ({ url: SAFE_SERVER_URL }),
			assert: ({ root }) => expectAttr(root, '#link', 'href', url),
		});

		// Also protect the compiler-static client/server bake.
		const rendered = renderDetached(client.StaticSafeLink, undefined);
		try {
			expectAttr(rendered.container, '#safe', 'href', url);
		} finally {
			rendered.root.unmount();
		}
		expectAttr(
			parseHtml(ServerRT.renderToString(server.StaticSafeLink).html),
			'#safe',
			'href',
			url,
		);
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:61.
	it('a javascript protocol href', async () => {
		await expectInRenderMatrix({
			component: 'DynamicLinks',
			props: () => ({ first: UNSAFE_URL, last: 'javascript:notfineagain' }),
			mismatchServerProps: () => ({ first: SAFE_SERVER_URL, last: SAFE_SERVER_URL + 'last' }),
			assert: ({ root }) => {
				expectAttr(root, '#first', 'href', EXPECTED_SAFE_URL);
				expectAttr(root, '#last', 'href', EXPECTED_SAFE_URL);
			},
		});

		// Two static literals also prove the non-global sanitizer is applied to
		// each compiler bake independently.
		const rendered = renderDetached(client.StaticUnsafeLinks, undefined);
		try {
			expectAttr(rendered.container, '#static-first', 'href', EXPECTED_SAFE_URL);
			expectAttr(rendered.container, '#static-last', 'href', EXPECTED_SAFE_URL);
		} finally {
			rendered.root.unmount();
		}
		const staticServer = parseHtml(ServerRT.renderToString(server.StaticUnsafeLinks).html);
		expectAttr(staticServer, '#static-first', 'href', EXPECTED_SAFE_URL);
		expectAttr(staticServer, '#static-last', 'href', EXPECTED_SAFE_URL);

		// Hoisted metadata and public resource-hint APIs are URL sinks too.
		const headHtml = ServerRT.renderToString(server.HeadLink, { url: UNSAFE_URL }).html;
		expect(headHtml).toContain(`href="${EXPECTED_SAFE_URL}"`);
		const headBefore = new Set(document.head.querySelectorAll('link'));
		const headClient = renderDetached(client.HeadLink, { url: UNSAFE_URL });
		try {
			const clientHeadLink = Array.from(document.head.querySelectorAll('link')).find(
				(link) => !headBefore.has(link),
			);
			expect(clientHeadLink?.getAttribute('href')).toBe(EXPECTED_SAFE_URL);
		} finally {
			headClient.root.unmount();
		}
		const HintPage = () => {
			ServerRT.preload(UNSAFE_URL, { as: 'script' });
			ServerRT.preinit(UNSAFE_URL, { as: 'style' });
			ServerRT.preconnect(UNSAFE_URL);
			ServerRT.prefetchDNS(UNSAFE_URL);
			return '<main>hints</main>';
		};
		const hints = ServerRT.renderToString(HintPage as any).html;
		const escaped = EXPECTED_SAFE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		expect(hints.match(new RegExp(escaped, 'g'))).toHaveLength(4);

		const hintUrl = 'javascript:client-hint-' + process.env.OCTANE_TEST_COMPILE_MODE;
		ClientRT.preload(hintUrl, { as: 'image' });
		const clientHint = Array.from(document.head.querySelectorAll('[data-oct-hint]')).find(
			(element) => element.getAttribute('data-oct-hint')?.includes(hintUrl),
		);
		try {
			expect(clientHint?.getAttribute('href')).toBe(EXPECTED_SAFE_URL);
		} finally {
			clientHint?.remove();
		}

		// URL-derived dedupe keys are DATA, not selector syntax. Quotes and
		// brackets must neither throw nor prevent exact duplicate detection.
		const selectorHostileHref =
			'https://safe.example/hint-" ] [data-oct-hint="poison-' +
			process.env.OCTANE_TEST_COMPILE_MODE;
		const selectorHostileKey = 'preload:image:' + selectorHostileHref;
		expect(() => ClientRT.preload(selectorHostileHref, { as: 'image' })).not.toThrow();
		expect(() => ClientRT.preload(selectorHostileHref, { as: 'image' })).not.toThrow();
		const selectorHostileHints = Array.from(
			document.head.querySelectorAll('[data-oct-hint]'),
		).filter((element) => element.getAttribute('data-oct-hint') === selectorHostileKey);
		try {
			expect(selectorHostileHints).toHaveLength(1);
		} finally {
			for (const element of selectorHostileHints) element.remove();
		}

		// Snapshot each public hint href once: a hostile coercion cannot look safe
		// to the sanitizer and become unsafe during the later key/property write.
		function changingHref(safe: string) {
			let calls = 0;
			return {
				value: {
					toString() {
						calls++;
						return calls === 1 ? safe : UNSAFE_URL;
					},
				},
				calls: () => calls,
			};
		}
		const serverPreload = changingHref('https://safe.example/server-preload');
		const serverPreinit = changingHref('https://safe.example/server-preinit');
		const serverPreconnect = changingHref('https://safe.example/server-preconnect');
		const serverPrefetchDNS = changingHref('https://safe.example/server-prefetch-dns');
		const CoercingHintPage = () => {
			ServerRT.preload(serverPreload.value as any, { as: 'image' });
			ServerRT.preinit(serverPreinit.value as any, { as: 'style' });
			ServerRT.preconnect(serverPreconnect.value as any);
			ServerRT.prefetchDNS(serverPrefetchDNS.value as any);
			return '<main>coercion hints</main>';
		};
		const coercingHints = ServerRT.renderToString(CoercingHintPage as any).html;
		expect(serverPreload.calls()).toBe(1);
		expect(serverPreinit.calls()).toBe(1);
		expect(serverPreconnect.calls()).toBe(1);
		expect(serverPrefetchDNS.calls()).toBe(1);
		expect(coercingHints).toContain('href="https://safe.example/server-preload"');
		expect(coercingHints).toContain('href="https://safe.example/server-preinit"');
		expect(coercingHints).toContain('href="https://safe.example/server-preconnect"');
		expect(coercingHints).toContain('href="https://safe.example/server-prefetch-dns"');
		const OptionHintPage = () => {
			ServerRT.preload('https://safe.example/option-hint', {
				as: 'image',
				src: UNSAFE_URL,
			});
			return '<main>option hint</main>';
		};
		expect(ServerRT.renderToString(OptionHintPage as any).html).toContain(
			`src="${EXPECTED_SAFE_URL}"`,
		);

		const clientPreload = changingHref('https://safe.example/client-preload');
		const clientPreinit = changingHref('https://safe.example/client-preinit');
		const clientPreconnect = changingHref('https://safe.example/client-preconnect');
		const clientPrefetchDNS = changingHref('https://safe.example/client-prefetch-dns');
		ClientRT.preload(clientPreload.value as any, { as: 'image' });
		ClientRT.preinit(clientPreinit.value as any, { as: 'style' });
		ClientRT.preconnect(clientPreconnect.value as any);
		ClientRT.prefetchDNS(clientPrefetchDNS.value as any);
		ClientRT.preload('https://safe.example/client-option-hint', {
			as: 'image',
			src: UNSAFE_URL,
		});
		const coercionClientHints = Array.from(
			document.head.querySelectorAll('[data-oct-hint]'),
		).filter((element) =>
			element.getAttribute('data-oct-hint')?.includes('https://safe.example/client-'),
		);
		try {
			expect(clientPreload.calls()).toBe(1);
			expect(clientPreinit.calls()).toBe(1);
			expect(clientPreconnect.calls()).toBe(1);
			expect(clientPrefetchDNS.calls()).toBe(1);
			expect(
				coercionClientHints
					.map((element) => element.getAttribute('href'))
					.filter((href) => !href?.includes('option-hint'))
					.sort(),
			).toEqual(
				[
					'https://safe.example/client-preconnect',
					'https://safe.example/client-prefetch-dns',
					'https://safe.example/client-preinit',
					'https://safe.example/client-preload',
				].sort(),
			);
			const optionHint = coercionClientHints.find((element) =>
				element.getAttribute('href')?.includes('option-hint'),
			);
			expect(optionHint?.getAttribute('src')).toBe(EXPECTED_SAFE_URL);
		} finally {
			for (const element of coercionClientHints) element.remove();
		}
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:73.
	it('sanitizes on various tags', async () => {
		const assertDirect = ({ root }: MatrixObservation) => {
			expectAttr(root, '#var-a', 'href', EXPECTED_SAFE_URL);
			expectAttr(root, '#var-object', 'data', EXPECTED_SAFE_URL);
			expectAttr(root, '#var-embed', 'src', EXPECTED_SAFE_URL);
		};
		await expectInRenderMatrix({
			component: 'VariousTags',
			props: () => ({ url: UNSAFE_URL }),
			mismatchServerProps: () => ({ url: SAFE_SERVER_URL }),
			assert: assertDirect,
		});

		// Spreads and public createElement descriptors must reach the same policy.
		await expectInRenderMatrix({
			component: 'SpreadSinks',
			props: () => ({
				anchor: { href: UNSAFE_URL },
				upperAnchor: { HREF: UNSAFE_URL },
				object: { data: UNSAFE_URL },
			}),
			mismatchServerProps: () => ({
				anchor: { href: SAFE_SERVER_URL },
				upperAnchor: { HREF: SAFE_SERVER_URL },
				object: { data: SAFE_SERVER_URL },
			}),
			assert: ({ root }) => {
				expectAttr(root, '#spread-a', 'href', EXPECTED_SAFE_URL);
				expectAttr(root, '#spread-upper-a', 'href', EXPECTED_SAFE_URL);
				expectAttr(root, '#spread-object', 'data', EXPECTED_SAFE_URL);
			},
		});
		await expectInRenderMatrix({
			component: 'DeoptSinks',
			props: () => ({ url: UNSAFE_URL }),
			mismatchServerProps: () => ({ url: SAFE_SERVER_URL }),
			assert: ({ root }) => {
				expectAttr(root, '#deopt-a', 'href', EXPECTED_SAFE_URL);
				expectAttr(root, '#deopt-object', 'data', EXPECTED_SAFE_URL);
				expectAttr(root, '#deopt-upper-object', 'data', EXPECTED_SAFE_URL);
			},
			expectMismatchWarning: false,
		});
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:84.
	it('passes through data on non-object tags', async () => {
		await expectInRenderMatrix({
			component: 'DataPassThrough',
			props: () => ({ value: 'test', url: 'javascript:fine' }),
			mismatchServerProps: () => ({ value: 'server', url: SAFE_SERVER_URL }),
			assert: ({ root }) => {
				expectAttr(root, '#data-div', 'data', 'test');
				expectAttr(root, '#data-a', 'data', 'javascript:fine');
				// React 19 custom elements keep raw attribute semantics.
				expectAttr(root, '#custom-url', 'href', 'javascript:fine');
			},
		});
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:92.
	it('a javascript protocol with leading spaces', async () => {
		await expectInRenderMatrix(
			urlCase('DynamicLink', '#link', 'href', '  \t \u0000\u001F\u0003javascript\n: notfine'),
		);
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:101.
	it('a javascript protocol with intermediate new lines and mixed casing', async () => {
		await expectInRenderMatrix(
			urlCase('DynamicLink', '#link', 'href', '\t\r\n Jav\rasCr\r\niP\t\n\rt\n:notfine'),
		);
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:111.
	it('a javascript protocol area href', async () => {
		await expectInRenderMatrix(urlCase('AreaLink', '#area', 'href'));
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:120.
	it('a javascript protocol form action', async () => {
		await expectInRenderMatrix(urlCase('FormAction', '#form', 'action'));
		const staticHtml = ServerRT.renderToString(server.StaticFormActions).html;
		expectHtmlAttr(staticHtml, 'static-form', 'action', EXPECTED_SAFE_URL);
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:125.
	it('a javascript protocol input formAction', async () => {
		await expectInRenderMatrix(urlCase('InputFormAction', '#input', 'formaction'));
		const staticHtml = ServerRT.renderToString(server.StaticFormActions).html;
		expectHtmlAttr(staticHtml, 'static-input', 'formAction', EXPECTED_SAFE_URL);
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:132.
	it('a javascript protocol button formAction', async () => {
		await expectInRenderMatrix(urlCase('ButtonFormAction', '#button', 'formaction'));
		const staticHtml = ServerRT.renderToString(server.StaticFormActions).html;
		expectHtmlAttr(staticHtml, 'static-button', 'formAction', EXPECTED_SAFE_URL);
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:139.
	it('a javascript protocol iframe src', async () => {
		// Detached client/hydration containers prevent jsdom from navigating the
		// deliberately-throwing diagnostic URL while preserving the real src write.
		await expectInRenderMatrix(urlCase('IframeSource', '#iframe', 'src'));
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:144. React excludes two
	// default-body modes; Octane can exercise the full matrix by hydrating inside
	// the element's real `<frameset>` parsing context.
	it('a javascript protocol frame src', async () => {
		await expectInRenderMatrix({
			...urlCase('FrameSource', '#frame', 'src'),
			containerTag: 'frameset',
			expectMismatchWarning: false,
			assert(observation) {
				if (observation.mode === 'server-string' || observation.mode === 'server-stream') {
					expectHtmlAttr(observation.html, 'frame', 'src', EXPECTED_SAFE_URL);
				} else {
					expectAttr(observation.root, '#frame', 'src', EXPECTED_SAFE_URL);
				}
			},
		});
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:161.
	it('a javascript protocol in an SVG link', async () => {
		await expectInRenderMatrix(urlCase('SvgHref', '#svg-href', 'href'));

		// React's custom-element test exempts these hyphenated reserved native
		// SVG/MathML names; they must retain URL sanitization rather than raw custom
		// element semantics.
		const ids = [
			'reserved-annotation-xml',
			'reserved-color-profile',
			'reserved-font-face',
			'reserved-font-face-src',
			'reserved-font-face-uri',
			'reserved-font-face-format',
			'reserved-font-face-name',
			'reserved-missing-glyph',
		];
		await expectInRenderMatrix({
			component: 'ReservedHyphenatedSinks',
			props: () => ({ url: UNSAFE_URL }),
			mismatchServerProps: () => ({ url: SAFE_SERVER_URL }),
			assert: ({ root }) => {
				for (const id of ids) expectAttr(root, '#' + id, 'href', EXPECTED_SAFE_URL);
			},
		});

		// Hyphenated reserved tags currently bypass the general JSX alias table,
		// so pin sanitization of the raw `xlinkHref` spelling too. Namespace/alias
		// normalization for these obsolete tags is a separate compatibility concern.
		await expectInRenderMatrix({
			component: 'ReservedHyphenatedXlinkSink',
			props: () => ({ url: UNSAFE_URL }),
			mismatchServerProps: () => ({ url: SAFE_SERVER_URL }),
			modes: ['client', 'server-string', 'server-stream'],
			assert: ({ root }) => {
				expectCaseFoldedAttr(root, '#reserved-font-face-uri-xlink', 'xlinkHref', EXPECTED_SAFE_URL);
			},
		});
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:170.
	it('a javascript protocol in an SVG link with a namespace', async () => {
		await expectInRenderMatrix({
			component: 'SvgXlinkHref',
			props: () => ({ url: UNSAFE_URL }),
			mismatchServerProps: () => ({ url: SAFE_SERVER_URL }),
			assert({ root }) {
				const link = root.querySelector('#svg-xlink');
				expect(link).not.toBeNull();
				expect(link!.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe(
					EXPECTED_SAFE_URL,
				);
			},
		});
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:184.
	it('rejects a javascript protocol href if it is added during an update', () => {
		const rendered = renderDetached(client.DynamicLink, { url: 'http://thisisfine/' });
		try {
			expectAttr(rendered.container, '#link', 'href', 'http://thisisfine/');
			ClientRT.flushSync(() => rendered.root.render(client.DynamicLink, { url: UNSAFE_URL }));
			expectAttr(rendered.container, '#link', 'href', EXPECTED_SAFE_URL);
		} finally {
			rendered.root.unmount();
		}
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:197.
	it('only the first invocation of toString', async () => {
		type CoercionProps = { url: object; coercionCount: () => number };
		const makeProps = (): CoercionProps => {
			let calls = 0;
			return {
				url: {
					toString() {
						calls++;
						return calls === 1 ? 'https://react.dev/' : UNSAFE_URL;
					},
				},
				coercionCount: () => calls,
			};
		};
		await expectInRenderMatrix({
			component: 'DynamicLink',
			props: makeProps,
			mismatchServerProps: () => ({ url: SAFE_SERVER_URL }),
			assert(observation) {
				expectAttr(observation.root, '#link', 'href', 'https://react.dev/');
				for (const props of [observation.serverProps, observation.clientProps]) {
					if (typeof props?.coercionCount === 'function') expect(props.coercionCount()).toBe(1);
				}
			},
		});
	});

	// Per ReactDOMServerIntegrationUntrustedURL-test.js:238. Distinct unsafe
	// strings force two writes and prove the shared RegExp carries no global state.
	it('rejects a javascript protocol href if it is added during an update twice', () => {
		const rendered = renderDetached(client.DynamicLink, { url: 'http://thisisfine/' });
		try {
			ClientRT.flushSync(() => rendered.root.render(client.DynamicLink, { url: UNSAFE_URL }));
			expectAttr(rendered.container, '#link', 'href', EXPECTED_SAFE_URL);
			ClientRT.flushSync(() =>
				rendered.root.render(client.DynamicLink, { url: 'javascript:notfineagain' }),
			);
			expectAttr(rendered.container, '#link', 'href', EXPECTED_SAFE_URL);
		} finally {
			rendered.root.unmount();
		}
	});
});
