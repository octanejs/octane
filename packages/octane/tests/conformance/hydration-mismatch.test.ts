import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ClientRT from '../../src/index.js';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';

// Conformance port of facebook/react's hydration mismatch matrix —
// `ReactDOMHydrationDiff-test.js` and `ReactDOMServerIntegrationReconnecting-test.js` — against
// Octane's hydration mismatch detection + recovery.
//
// WHAT OCTANE DOES vs REACT (intentional divergences — asserted at the OUTCOME level):
//   * VALUE mismatch (text / attribute / style): Octane WARNS (dev, `console.error` containing
//     "hydration mismatch") and PATCHES the adopted node to the CLIENT value in place. React
//     regenerates the subtree for text and, for attributes, warns but keeps the SERVER value
//     ("won't be patched up"). So Octane's final DOM = the client value for BOTH; React's = the
//     client value for text but the SERVER value for attributes.
//   * STRUCTURAL mismatch (element type / extra-or-missing node / branch swap): Octane WARNS and
//     REBUILDS only the mismatched node/subtree in place, keeping the hydration cursor aligned.
//     React throws in that subtree and client-renders the whole boundary. Observable final DOM
//     is the same (the client tree); the recovery MECHANISM differs.
//   * Octane never throws, has no React-format message / component stack, and `hydrateRoot` has
//     no `onRecoverableError` — so we assert fire/no-fire of the warning + correct final DOM +
//     interactivity, never React's exact wording.
// Recovery runs in dev AND prod; the warning is dev-only (gated on the dev source LOC), so the
// CLIENT fixture is compiled with `dev: true`.

const FIX = join(
	process.cwd(),
	'packages/octane/tests/conformance/_fixtures/hydration-mismatch.tsrx',
);
const FILE = 'hydration-mismatch.tsrx';

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIX, 'utf8'), FILE, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
}
function devClientModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIX, 'utf8'), FILE, { mode: 'client', dev: true });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ClientRT, {});
}

const server = serverModule();
const client = devClientModule();

let container: HTMLElement;
let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	container.remove();
	errSpy.mockRestore();
});

const warns = () =>
	errSpy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('hydration mismatch'));

// Server-render `name` with serverProps, hydrate with clientProps, drive the render.
async function reconnect(name: string, serverProps: any, clientProps: any) {
	const { html } = await ServerRT.renderToString(server[name], serverProps);
	container.innerHTML = html;
	hydrateRoot(container, client[name], clientProps);
	flushSync(() => {});
	return html;
}

// Server-render one component and hydrate with a DIFFERENT one (React's expectMarkupMatch of
// e.g. a Pure Component against a Bare Element — different "kinds" that emit the same markup).
async function crossReconnect(serverName: string, clientName: string, props: any) {
	const { html } = await ServerRT.renderToString(server[serverName], props);
	container.innerHTML = html;
	hydrateRoot(container, client[clientName], props);
	flushSync(() => {});
	return html;
}

describe('conformance: hydration mismatch (ReactDOMHydrationDiff + ReactDOMServerIntegrationReconnecting)', () => {
	describe('value mismatch — text', () => {
		it('warns + patches to the client text (Per ReactDOMHydrationDiff-test.js:119)', async () => {
			await reconnect('TextMismatch', { isClient: false }, { isClient: true });
			expect(container.querySelector('main.child')!.textContent).toBe('client');
			expect(warns().length).toBe(1);
		});

		// Per Reconnecting-test.js:306 — differing whitespace IS a real mismatch (not collapsed).
		it('treats a whitespace-only text difference as a mismatch (Per :306)', async () => {
			await reconnect('WhitespaceMismatch', { isClient: false }, { isClient: true });
			expect(container.querySelector('#ws')!.textContent).toBe('a b');
			expect(warns().length).toBe(1);
		});
	});

	describe('value mismatch — attribute / style', () => {
		// Per ReactDOMHydrationDiff-test.js:245. Octane divergence: patches to CLIENT (React keeps server).
		it('warns + patches attributes to the client values (Per :245)', async () => {
			await reconnect('AttrMismatch', { isClient: false }, { isClient: true });
			const main = container.querySelector('main')!;
			expect(main.getAttribute('class')).toBe('child client');
			expect(main.getAttribute('dir')).toBe('ltr');
			expect(warns().length).toBeGreaterThanOrEqual(1);
		});

		it('warns + adds a client-only attribute (Per :287)', async () => {
			await reconnect('ClientExtraAttr', { isClient: false }, { isClient: true });
			expect(container.querySelector('main')!.getAttribute('tabindex')).toBe('1');
			expect(warns().length).toBeGreaterThanOrEqual(1);
		});

		it('warns + removes a server-only attribute (Per :331)', async () => {
			await reconnect('ServerExtraAttr', { isClient: false }, { isClient: true });
			expect(container.querySelector('main')!.hasAttribute('tabindex')).toBe(false);
			expect(warns().length).toBeGreaterThanOrEqual(1);
		});

		it('warns + patches an inline style difference (Per :419)', async () => {
			await reconnect('StyleMismatch', { isClient: false }, { isClient: true });
			expect((container.querySelector('main') as HTMLElement).style.color).toBe('red');
			expect(warns().length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('clean reconnect — no mismatch', () => {
		it('identical markup adopts with no warning (Per Reconnecting:64+)', async () => {
			const before =
				(await reconnect('Clean', { isClient: false }, { isClient: true }), container.innerHTML);
			expect(warns()).toEqual([]);
			expect(container.querySelector('#clean .leaf')!.textContent).toBe('stable');
			expect(before).toBe(container.innerHTML);
		});

		it('number vs string of the same number reconnects clean (Per Reconnecting:215)', async () => {
			await reconnect('NumberString', { isClient: false }, { isClient: true });
			expect(container.querySelector('#numstr')!.textContent).toBe('5');
			expect(warns()).toEqual([]);
		});

		it('null/false attributes coerce to absent on both sides — clean (Per coercion parity)', async () => {
			await reconnect('NullishAttr', { isClient: false }, { isClient: true });
			const el = container.querySelector('#nullish')!;
			expect(el.hasAttribute('class')).toBe(false);
			expect(el.hasAttribute('data-x')).toBe(false);
			expect(warns()).toEqual([]);
		});
	});

	describe('suppressHydrationWarning', () => {
		// Per Reconnecting:132 "can explicitly ignore errors reconnecting …".
		it('keeps the server value + no warning (Per :132)', async () => {
			const body = await reconnect('Suppressed', { isClient: false }, { isClient: true });
			expect(body).not.toContain('suppressHydrationWarning');
			expect(container.querySelector('#sup')!.textContent).toBe('server');
			expect(warns()).toEqual([]);
		});
	});

	describe('structural mismatch — rebuild', () => {
		it('different element type is rebuilt (Per Reconnecting:104)', async () => {
			await reconnect('ElementTypeMismatch', { isClient: false }, { isClient: true });
			const div = container.querySelector('#etm')!;
			expect(div.querySelector('article.x')).not.toBeNull();
			expect(div.querySelector('section.x')).toBeNull();
			expect(warns().length).toBeGreaterThanOrEqual(1);
		});

		it('client renders an extra element as only child (Per :533)', async () => {
			await reconnect('ClientExtraOnlyChild', { isClient: false }, { isClient: true });
			const div = container.querySelector('#ceoc')!;
			expect(div.querySelector('span.extra')).not.toBeNull();
			expect(div.querySelector('span.extra')!.textContent).toBe('x');
			expect(warns().length).toBeGreaterThanOrEqual(1);
		});

		it('client renders an extra element before a stable sibling (Per :567)', async () => {
			await reconnect('ClientExtraBegin', { isClient: false }, { isClient: true });
			const div = container.querySelector('#ceb')!;
			expect(div.querySelector('br.extra')).not.toBeNull();
			expect(div.querySelector('main.child')!.textContent).toBe('hello');
			expect(warns().length).toBeGreaterThanOrEqual(1);
		});

		it('client renders an extra element in the middle; both siblings stay adopted (Per :605)', async () => {
			await reconnect('ClientExtraMiddle', { isClient: false }, { isClient: true });
			const div = container.querySelector('#cem')!;
			expect(div.querySelector('br.extra')).not.toBeNull();
			expect(div.querySelector('main.a')!.textContent).toBe('A');
			expect(div.querySelector('main.b')!.textContent).toBe('B'); // sibling after the extra stays aligned
			expect(warns().length).toBeGreaterThanOrEqual(1);
		});

		it('client renders an extra element at the end (Per :644)', async () => {
			await reconnect('ClientExtraEnd', { isClient: false }, { isClient: true });
			const div = container.querySelector('#cee')!;
			expect(div.querySelector('br.extra')).not.toBeNull();
			expect(div.querySelector('main.a')!.textContent).toBe('A');
			expect(warns().length).toBeGreaterThanOrEqual(1);
		});

		it('server renders an extra element the client omits (Per :834)', async () => {
			await reconnect('ServerExtraElement', { isClient: false }, { isClient: true });
			const div = container.querySelector('#see')!;
			expect(div.querySelector('span.gone')).toBeNull();
			expect(div.querySelector('main.child')!.textContent).toBe('hello');
			expect(warns().length).toBeGreaterThanOrEqual(1);
		});

		it('an extra node deeper in the tree is rebuilt (Per :1521)', async () => {
			await reconnect('DeepExtra', { isClient: false }, { isClient: true });
			const p = container.querySelector('#deep .para')!;
			expect(p.querySelector('b.bold')).not.toBeNull();
			expect(p.querySelector('span.tail')!.textContent).toBe('tail');
			expect(warns().length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('additional distinctions', () => {
		it('two different numbers are a text mismatch, patched to client (Per Reconnecting:218)', async () => {
			await reconnect('DifferentNumbers', { isClient: false }, { isClient: true });
			expect(container.querySelector('#dn')!.textContent).toBe('42');
			expect(warns().length).toBe(1);
		});

		// Per ReactDOMHydrationDiff-test.js:196 / Reconnecting:405. dangerouslySetInnerHTML is a
		// PROPERTY write, not diffed during hydration (React doesn't diff it either). Octane emits
		// no mismatch warning and applies the client html. Intentional divergence from React's
		// "attributes didn't match … won't be patched up" warning for this prop.
		it('dangerouslySetInnerHTML difference is not flagged; client html applied (Per :196)', async () => {
			await reconnect('DangerHtml', { isClient: false }, { isClient: true });
			expect(container.querySelector('#dh')!.innerHTML).toBe('<i>client</i>');
			expect(warns()).toEqual([]);
		});

		// Per Reconnecting:144 "can explicitly ignore errors reconnecting different attribute values".
		it('suppressHydrationWarning on an attribute keeps the server value + no warning (Per :144)', async () => {
			await reconnect('SuppressedAttr', { isClient: false }, { isClient: true });
			expect(container.querySelector('#supa')!.getAttribute('class')).toBe('server');
			expect(warns()).toEqual([]);
		});

		// Per Reconnecting:85 (Pure↔Pure) — the same function component reconnects clean.
		it('the same function component reconnects clean (Per :85)', async () => {
			const before = (await reconnect('CompForm', {}, {}), container.innerHTML);
			expect(container.querySelector('#leaf.leaf')!.textContent).toBe('ok');
			expect(warns()).toEqual([]);
			expect(before).toBe(container.innerHTML);
		});

		// Per Reconnecting:100 (Bare↔Bare) — a bare element reconnects clean.
		it('a bare element reconnects clean (Per :100)', async () => {
			const before = (await reconnect('BareForm', {}, {}), container.innerHTML);
			expect(container.querySelector('#leaf.leaf')!.textContent).toBe('ok');
			expect(warns()).toEqual([]);
			expect(before).toBe(container.innerHTML);
		});

		// INTENTIONAL DIVERGENCE (Per Reconnecting:76/:91 Bare↔Pure): React treats component
		// boundaries as DOM-invisible, so a component-form and a bare-element-form of the same
		// markup reconnect clean. Octane function components leave hydration block markers
		// (`<!--[-->…<!--]-->`) that a bare element lacks, so cross-reconnecting the two is a
		// STRUCTURAL mismatch octane detects + rebuilds. The normal case (same authoring form on
		// both sides — the two tests above) is clean; only mixing forms across the SSR boundary
		// (unusual) diverges. Final DOM is still correct.
		it('component-form ↔ bare-form is a structural mismatch in octane (divergence, Per :76)', async () => {
			await crossReconnect('CompForm', 'BareForm', {});
			expect(container.querySelector('#leaf.leaf')!.textContent).toBe('ok');
			expect(warns().length).toBeGreaterThanOrEqual(1);
		});

		// Octane's defining divergence: on a mismatch it does NOT throw/unwind — hydration
		// CONTINUES, so a following sibling still adopts the server node and stays interactive.
		it('hydration continues past a mismatch: the next sibling adopts + is interactive', async () => {
			await reconnect('MismatchThenButton', { isClient: false }, { isClient: true });
			expect(container.querySelector('#mtb .msg')!.textContent).toBe('client'); // mismatch patched
			expect(warns().length).toBeGreaterThanOrEqual(1);
			const btn = container.querySelector('#mtb-btn') as HTMLButtonElement;
			expect(btn.textContent).toBe('count:0');
			flushSync(() => btn.click());
			expect(btn.textContent).toBe('count:1'); // handler attached to the adopted node
		});
	});
});
