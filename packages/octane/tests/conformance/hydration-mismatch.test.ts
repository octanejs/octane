import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';

// Conformance port of facebook/react's hydration mismatch matrix —
// `ReactDOMHydrationDiff-test.js` and `ReactDOMServerIntegrationReconnecting-test.js` —
// asserting React 19's outcomes:
//   * A TEXT or STRUCTURAL mismatch (element type, extra or missing node) is never repaired in
//     place. With no Suspense boundary around it, the root discards its server DOM and renders
//     on the client: no server node survives, and onRecoverableError fires once.
//   * An ATTRIBUTE, style or raw HTML difference is never patched: the adopted element keeps the
//     server's value, development logs one "won't be patched up" warning, and nothing is
//     reported as recoverable.
//   * suppressHydrationWarning keeps the server's text and attributes without a warning.
// Octane's development warnings name the template's source location instead of React's
// component stack, so the CLIENT fixture is compiled with `dev: true`.

const FIX = join(
	process.cwd(),
	'packages/octane/tests/conformance/_fixtures/hydration-mismatch.tsrx',
);
const FILE = 'hydration-mismatch.tsrx';

const server = loadServerFixture(FIX, { id: FILE });
const client = loadCompiledFixtureSource(readFileSync(FIX, 'utf8'), {
	id: FILE,
	mode: 'client',
	compileOptions: { dev: true },
});

const RECOVERABLE = /^Hydration failed because the server rendered HTML didn't match the client\./;
const UNPATCHED = "This won't be patched up";

let container: HTMLElement;
let errSpy: ReturnType<typeof vi.spyOn>;
let root: ReturnType<typeof hydrateRoot> | null;
let recoverable: string[];
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	root = null;
	recoverable = [];
});
afterEach(() => {
	root?.unmount();
	container.remove();
	errSpy.mockRestore();
});

const warns = () =>
	errSpy.mock.calls
		.map((c: unknown[]) => String(c[0]))
		.filter((m: string) => m.includes('hydration mismatch'));

// Hydrate `clientName` over the server render of `serverName`, returning the server's HTML and
// its elements so each case can check which of them survived.
async function crossReconnect(
	serverName: string,
	clientName: string,
	serverProps: any,
	clientProps: any = serverProps,
) {
	const { html } = await ServerRT.renderToString(server[serverName], serverProps);
	container.innerHTML = html;
	const serverNodes = [...container.querySelectorAll('*')];
	root = hydrateRoot(container, client[clientName], clientProps, {
		onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
	});
	flushSync(() => {});
	// Recoverable errors are delivered after the hydrating render.
	await act(async () => {});
	return { html, serverNodes };
}

// Server-render `name` with serverProps and hydrate it with clientProps.
function reconnect(name: string, serverProps: any, clientProps: any) {
	return crossReconnect(name, name, serverProps, clientProps);
}

/** The root rendered on the client: none of the server's elements survived. */
function expectRootFallback(serverNodes: Element[]): void {
	expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
	expect(recoverable).toEqual([expect.stringMatching(RECOVERABLE)]);
	expect(warns()).toHaveLength(1);
}

/** Every server element was adopted. */
function expectAdopted(serverNodes: Element[]): void {
	const nodes = [...container.querySelectorAll('*')];
	expect(nodes).toHaveLength(serverNodes.length);
	nodes.forEach((node, index) => expect(node).toBe(serverNodes[index]));
	expect(recoverable).toEqual([]);
}

describe('conformance: hydration mismatch (ReactDOMHydrationDiff + ReactDOMServerIntegrationReconnecting)', () => {
	describe('text mismatch — the root renders on the client', () => {
		it('renders the client text (Per ReactDOMHydrationDiff-test.js:119)', async () => {
			const { serverNodes } = await reconnect(
				'TextMismatch',
				{ isClient: false },
				{ isClient: true },
			);
			expect(container.querySelector('main.child')!.textContent).toBe('client');
			expectRootFallback(serverNodes);
		});

		// Per ReactDOMHydrationDiff-test.js:155 — hydration compares decoded
		// Unicode text rather than mistaking an authored HTML entity for markup.
		it('detects differing text beside an escaped nbsp entity (Per :155)', async () => {
			const { html, serverNodes } = await reconnect(
				'EscapedEntityTextMismatch',
				{ isClient: false },
				{ isClient: true },
			);
			const node = container.querySelector('#escaped-entity-mismatch')!;
			expect(html).toContain('nbsp entity:');
			expect(node.textContent).toContain('  client text');
			expect(node.textContent).not.toContain('server text');
			expectRootFallback(serverNodes);
			expect(warns()[0]).toContain('hydration-mismatch.tsrx:');
		});

		// Per Reconnecting-test.js:306 — differing whitespace IS a real mismatch (not collapsed).
		it('treats a whitespace-only text difference as a mismatch (Per :306)', async () => {
			const { serverNodes } = await reconnect(
				'WhitespaceMismatch',
				{ isClient: false },
				{ isClient: true },
			);
			expect(container.querySelector('#ws')!.textContent).toBe('a b');
			expectRootFallback(serverNodes);
		});

		it('treats two different numbers as a text mismatch (Per Reconnecting:218)', async () => {
			const { serverNodes } = await reconnect(
				'DifferentNumbers',
				{ isClient: false },
				{ isClient: true },
			);
			expect(container.querySelector('#dn')!.textContent).toBe('42');
			expectRootFallback(serverNodes);
		});

		it('leaves a client-rendered root interactive', async () => {
			const { serverNodes } = await reconnect(
				'MismatchThenButton',
				{ isClient: false },
				{ isClient: true },
			);
			expect(container.querySelector('#mtb .msg')!.textContent).toBe('client');
			expectRootFallback(serverNodes);
			const btn = container.querySelector('#mtb-btn') as HTMLButtonElement;
			expect(btn.textContent).toBe('count:0');
			flushSync(() => btn.click());
			expect(btn.textContent).toBe('count:1');
		});
	});

	describe('attribute / style mismatch — the server value is kept', () => {
		// Per ReactDOMHydrationDiff-test.js:245.
		it('keeps the server values of differing attributes and warns (Per :245)', async () => {
			const { serverNodes } = await reconnect(
				'AttrMismatch',
				{ isClient: false },
				{ isClient: true },
			);
			const main = container.querySelector('main')!;
			expect(main.getAttribute('class')).toBe('child server');
			expect(main.getAttribute('dir')).toBe('rtl');
			expectAdopted(serverNodes);
			expect(warns()).toEqual([expect.stringContaining(UNPATCHED)]);
		});

		it('does not add a client-only attribute (Per :287)', async () => {
			const { serverNodes } = await reconnect(
				'ClientExtraAttr',
				{ isClient: false },
				{ isClient: true },
			);
			expect(container.querySelector('main')!.hasAttribute('tabindex')).toBe(false);
			expectAdopted(serverNodes);
			expect(warns()).toEqual([expect.stringContaining(UNPATCHED)]);
		});

		it('does not remove a server-only attribute (Per :331)', async () => {
			const { serverNodes } = await reconnect(
				'ServerExtraAttr',
				{ isClient: false },
				{ isClient: true },
			);
			expect(container.querySelector('main')!.getAttribute('tabindex')).toBe('1');
			expectAdopted(serverNodes);
			expect(warns()).toEqual([expect.stringContaining(UNPATCHED)]);
		});

		it('keeps the server inline style (Per :419)', async () => {
			const { serverNodes } = await reconnect(
				'StyleMismatch',
				{ isClient: false },
				{ isClient: true },
			);
			expect((container.querySelector('main') as HTMLElement).style.color).toBe('blue');
			expectAdopted(serverNodes);
			expect(warns()).toEqual([expect.stringContaining(UNPATCHED)]);
		});

		// Per ReactDOMHydrationDiff-test.js:196 / Reconnecting:405. Raw HTML follows the
		// attribute policy: diagnose the difference and keep the server content.
		it('keeps the server html of a dangerouslySetInnerHTML difference (Per :196)', async () => {
			const { serverNodes } = await reconnect(
				'DangerHtml',
				{ isClient: false },
				{ isClient: true },
			);
			expect(container.querySelector('#dh')!.innerHTML).toBe('<i>server</i>');
			expectAdopted(serverNodes);
			expect(warns()).toEqual([expect.stringContaining(UNPATCHED)]);
		});
	});

	describe('clean reconnect — no mismatch', () => {
		it('identical markup adopts with no warning (Per Reconnecting:64+)', async () => {
			const { serverNodes } = await reconnect('Clean', { isClient: false }, { isClient: true });
			const before = container.innerHTML;
			expect(warns()).toEqual([]);
			expect(container.querySelector('#clean .leaf')!.textContent).toBe('stable');
			expect(before).toBe(container.innerHTML);
			expectAdopted(serverNodes);
		});

		it('number vs string of the same number reconnects clean (Per Reconnecting:215)', async () => {
			const { serverNodes } = await reconnect(
				'NumberString',
				{ isClient: false },
				{ isClient: true },
			);
			expect(container.querySelector('#numstr')!.textContent).toBe('5');
			expect(warns()).toEqual([]);
			expectAdopted(serverNodes);
		});

		it('null/false attributes coerce to absent on both sides — clean (Per coercion parity)', async () => {
			const { serverNodes } = await reconnect(
				'NullishAttr',
				{ isClient: false },
				{ isClient: true },
			);
			const el = container.querySelector('#nullish')!;
			expect(el.hasAttribute('class')).toBe(false);
			expect(el.hasAttribute('data-x')).toBe(false);
			expect(warns()).toEqual([]);
			expectAdopted(serverNodes);
		});

		// Per ReactDOMFizzServer-test.js:6677/:6729. A component that updates itself while
		// rendering is compared once those updates settle, so a text that an earlier attempt
		// rendered is no mismatch.
		it('compares a render-phase update’s text once it settles (Per Fizz:6677/:6729)', async () => {
			const { serverNodes } = await reconnect('DetachedTextRenderReplay', {}, {});
			expect(container.querySelector('#detached-text-transient')).toBeNull();
			expect(container.querySelector('#detached-text-final')?.textContent).toBe('final');
			expect(warns()).toEqual([]);
			expectAdopted(serverNodes);
		});

		// Per Reconnecting:85 (Pure↔Pure) — the same function component reconnects clean.
		it('the same function component reconnects clean (Per :85)', async () => {
			const { serverNodes } = await reconnect('CompForm', {}, {});
			const before = container.innerHTML;
			expect(container.querySelector('#leaf.leaf')!.textContent).toBe('ok');
			expect(warns()).toEqual([]);
			expect(before).toBe(container.innerHTML);
			expectAdopted(serverNodes);
		});

		// Per Reconnecting:100 (Bare↔Bare) — a bare element reconnects clean.
		it('a bare element reconnects clean (Per :100)', async () => {
			const { serverNodes } = await reconnect('BareForm', {}, {});
			const before = container.innerHTML;
			expect(container.querySelector('#leaf.leaf')!.textContent).toBe('ok');
			expect(warns()).toEqual([]);
			expect(before).toBe(container.innerHTML);
			expectAdopted(serverNodes);
		});

		// Per Reconnecting:76/:91 (Bare↔Pure): React treats component boundaries as
		// DOM-invisible, so a component-form and a bare-element-form of the same markup
		// reconnect clean. CompForm's `<Leaf/>` is the sole root of its body, so the server
		// emits no range for it and the two forms serialize identically.
		it('component-form ↔ bare-form reconnects clean (Per :76)', async () => {
			const { serverNodes } = await crossReconnect('CompForm', 'BareForm', {});
			expect(container.querySelector('#leaf.leaf')!.textContent).toBe('ok');
			expect(warns()).toEqual([]);
			expectAdopted(serverNodes);
		});
	});

	describe('suppressHydrationWarning', () => {
		// Per Reconnecting:132 "can explicitly ignore errors reconnecting …".
		it('keeps the server text + no warning (Per :132)', async () => {
			const { html, serverNodes } = await reconnect(
				'Suppressed',
				{ isClient: false },
				{ isClient: true },
			);
			expect(html).not.toContain('suppressHydrationWarning');
			expect(container.querySelector('#sup')!.textContent).toBe('server');
			expect(warns()).toEqual([]);
			expectAdopted(serverNodes);
		});

		// Per Reconnecting:144 "can explicitly ignore errors reconnecting different attribute values".
		it('keeps the server value of an attribute + no warning (Per :144)', async () => {
			const serverSrc = 'about:blank#server';
			const stableSrc = 'about:blank#stable';
			const { html } = await ServerRT.renderToString(server.SuppressedAttr, {
				isClient: false,
				src: serverSrc,
				stableSrc,
			});
			container.innerHTML = html;
			const frames = Array.from(container.querySelectorAll('iframe'));
			root = hydrateRoot(container, client.SuppressedAttr, {
				isClient: true,
				src: 'about:blank#client',
				stableSrc,
			});
			flushSync(() => {});
			expect(container.querySelector('#supa')!.getAttribute('class')).toBe('server');
			for (const frame of frames) expect(container.querySelector(`#${frame.id}`)).toBe(frame);
			// Either authored prop order must retain the server source.
			expect(frames[0].getAttribute('src')).toBe(serverSrc);
			expect(frames[1].getAttribute('src')).toBe(serverSrc);
			expect(frames[2].getAttribute('src')).toBe(stableSrc);
			expect(warns()).toEqual([]);

			const nextSrc = 'about:blank#updated';
			flushSync(() =>
				root!.render(client.SuppressedAttr, { isClient: true, src: nextSrc, stableSrc: nextSrc }),
			);
			for (const frame of frames) {
				expect(container.querySelector(`#${frame.id}`)).toBe(frame);
				expect(frame.getAttribute('src')).toBe(nextSrc);
			}
			expect(warns()).toEqual([]);
		});
	});

	describe('structural mismatch — the root renders on the client', () => {
		it('different element type (Per Reconnecting:104)', async () => {
			const { serverNodes } = await reconnect(
				'ElementTypeMismatch',
				{ isClient: false },
				{ isClient: true },
			);
			const div = container.querySelector('#etm')!;
			expect(div.querySelector('article.x')).not.toBeNull();
			expect(div.querySelector('section.x')).toBeNull();
			expectRootFallback(serverNodes);
		});

		it('client renders an extra element as only child (Per :533)', async () => {
			const { serverNodes } = await reconnect(
				'ClientExtraOnlyChild',
				{ isClient: false },
				{ isClient: true },
			);
			const div = container.querySelector('#ceoc')!;
			expect(div.querySelector('span.extra')!.textContent).toBe('x');
			expectRootFallback(serverNodes);
		});

		it('client renders an extra element before a stable sibling (Per :567)', async () => {
			const { serverNodes } = await reconnect(
				'ClientExtraBegin',
				{ isClient: false },
				{ isClient: true },
			);
			const div = container.querySelector('#ceb')!;
			expect(div.querySelector('br.extra')).not.toBeNull();
			expect(div.querySelector('main.child')!.textContent).toBe('hello');
			expectRootFallback(serverNodes);
		});

		it('client renders an extra element in the middle (Per :605)', async () => {
			const { serverNodes } = await reconnect(
				'ClientExtraMiddle',
				{ isClient: false },
				{ isClient: true },
			);
			const div = container.querySelector('#cem')!;
			expect(div.querySelector('br.extra')).not.toBeNull();
			expect(div.querySelector('main.a')!.textContent).toBe('A');
			expect(div.querySelector('main.b')!.textContent).toBe('B');
			expectRootFallback(serverNodes);
		});

		it('client renders an extra element at the end (Per :644)', async () => {
			const { serverNodes } = await reconnect(
				'ClientExtraEnd',
				{ isClient: false },
				{ isClient: true },
			);
			const div = container.querySelector('#cee')!;
			expect(div.querySelector('br.extra')).not.toBeNull();
			expect(div.querySelector('main.a')!.textContent).toBe('A');
			expectRootFallback(serverNodes);
		});

		it('server renders an extra element the client omits (Per :834)', async () => {
			const { serverNodes } = await reconnect(
				'ServerExtraElement',
				{ isClient: false },
				{ isClient: true },
			);
			const div = container.querySelector('#see')!;
			expect(div.querySelector('span.gone')).toBeNull();
			expect(div.querySelector('main.child')!.textContent).toBe('hello');
			expectRootFallback(serverNodes);
		});

		it('an extra node deeper in the tree (Per :1521)', async () => {
			const { serverNodes } = await reconnect('DeepExtra', { isClient: false }, { isClient: true });
			const p = container.querySelector('#deep .para')!;
			expect(p.querySelector('b.bold')).not.toBeNull();
			expect(p.querySelector('span.tail')!.textContent).toBe('tail');
			expectRootFallback(serverNodes);
		});

		// Per Reconnecting:122/:405 — a client-rendered host owns its raw HTML, which is
		// written rather than kept from the server like an adopted value.
		it('writes raw html into a client-rendered root (Per Reconnecting:122/:405)', async () => {
			const { serverNodes } = await crossReconnect(
				'DangerHtmlStructuralServer',
				'DangerHtmlStructuralClient',
				{},
			);
			expect(container.querySelector('#dh-structural-server')).toBeNull();
			expect(container.querySelector('#dh-structural-client')!.innerHTML).toBe('<b>client</b>');
			expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
			expect(recoverable).toEqual([expect.stringMatching(RECOVERABLE)]);
			expect(warns().length).toBeGreaterThanOrEqual(1);
		});
	});
});
