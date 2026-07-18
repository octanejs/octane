import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ClientRT from '../../src/index.js';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';

// P2 — hydration VALUE mismatch (text + attribute). When the server-rendered value at a
// dynamic site differs from the client's computed value, the runtime PATCHES the DOM to the
// client value (always) and, in DEV-compiled output, warns with a source location
// (`file:line:col`). We force a mismatch by server-rendering with one set of props and
// hydrating with another.

const LEAF = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/leaf.tsrx');
const MARKERLESS = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/markerless-text.tsx',
);
const SUPPRESS = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/suppress.tsrx');

function serverModule(fixture: string, file: string): Record<string, any> {
	let { code } = compile(readFileSync(fixture, 'utf8'), file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	// Preserve the module-local binding as well as exposing it. Compiled modules
	// may attach definition metadata (for example `$$singleRoot`) after an
	// exported function declaration, exactly as native ESM permits.
	code = code.replace(/export function (\w+)/g, 'const $1 = __exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
}

// DEV-compiled CLIENT module, eval'd against the test's runtime singleton (so the eval'd
// component's htext/setAttribute see the SAME `hydrating` flag that hydrateRoot sets).
function devClientModule(fixture: string, file: string): Record<string, any> {
	let { code } = compile(readFileSync(fixture, 'utf8'), file, { mode: 'client', dev: true });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, 'const $1 = __exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ClientRT, {});
}

describe('hydrateRoot — VALUE mismatch (text + attribute) detect/patch/warn', () => {
	const server = serverModule(LEAF, 'leaf.tsrx');
	const clientDev = devClientModule(LEAF, 'leaf.tsrx');
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

	it('patches a TEXT mismatch to the client value + warns with LOC', async () => {
		const { html } = await ServerRT.renderToString(server.Attrs, {
			id: 'a',
			cls: 'c',
			text: 'server',
		});
		expect(html).toContain('>server</div>');
		container.innerHTML = html;

		hydrateRoot(container, clientDev.Attrs, { id: 'a', cls: 'c', text: 'client' });
		flushSync(() => {});

		const div = container.querySelector('div')!;
		expect(div.textContent).toBe('client'); // patched to client value
		const msgs = errSpy.mock.calls.map((c) => String(c[0]));
		const textWarn = msgs.find((m) => m.includes('hydration mismatch') && m.includes('"server"'));
		expect(textWarn).toBeTruthy();
		expect(textWarn).toContain('leaf.tsrx:'); // source location present
		expect(textWarn).toContain('"client"');
	});

	it('patches an ATTRIBUTE mismatch to the client value + warns with LOC', async () => {
		const { html } = await ServerRT.renderToString(server.Attrs, {
			id: 'server-id',
			cls: 'c',
			text: 't',
		});
		expect(html).toContain('id="server-id"');
		container.innerHTML = html;

		hydrateRoot(container, clientDev.Attrs, { id: 'client-id', cls: 'c', text: 't' });
		flushSync(() => {});

		const div = container.querySelector('div')!;
		expect(div.getAttribute('id')).toBe('client-id'); // patched
		const msgs = errSpy.mock.calls.map((c) => String(c[0]));
		const attrWarn = msgs.find((m) => m.includes('attribute `id`'));
		expect(attrWarn).toBeTruthy();
		expect(attrWarn).toContain('leaf.tsrx:');
		expect(attrWarn).toContain('"server-id"');
		expect(attrWarn).toContain('"client-id"');
	});

	it('does NOT warn when server and client agree (DOM untouched)', async () => {
		const { html } = await ServerRT.renderToString(server.Attrs, {
			id: 'a',
			cls: 'c',
			text: 'same',
		});
		container.innerHTML = html;
		const before = container.innerHTML;

		hydrateRoot(container, clientDev.Attrs, { id: 'a', cls: 'c', text: 'same' });
		flushSync(() => {});

		expect(container.innerHTML).toBe(before);
		const warns = errSpy.mock.calls
			.map((c) => String(c[0]))
			.filter((m) => m.includes('hydration mismatch'));
		expect(warns).toEqual([]);
	});

	it('suppressHydrationWarning: keeps the SERVER value + no warning (text + attr)', async () => {
		const srv = serverModule(SUPPRESS, 'suppress.tsrx');
		const cli = devClientModule(SUPPRESS, 'suppress.tsrx');
		const { html } = await ServerRT.renderToString(srv.Suppressed, {
			id: 'server-id',
			text: 'server',
		});
		// The opt-out is NOT serialized into the server HTML.
		expect(html).not.toContain('suppressHydrationWarning');
		container.innerHTML = html;

		hydrateRoot(container, cli.Suppressed, { id: 'client-id', text: 'client' });
		flushSync(() => {});

		const div = container.querySelector('div')!;
		expect(div.getAttribute('id')).toBe('server-id'); // SERVER value kept
		expect(div.textContent).toBe('server'); // SERVER value kept
		const warns = errSpy.mock.calls
			.map((c) => String(c[0]))
			.filter((m) => m.includes('hydration mismatch'));
		expect(warns).toEqual([]); // suppressed
	});

	it('control (no suppress): same shape warns + patches', async () => {
		const srv = serverModule(SUPPRESS, 'suppress.tsrx');
		const cli = devClientModule(SUPPRESS, 'suppress.tsrx');
		const { html } = await ServerRT.renderToString(srv.NotSuppressed, {
			id: 'server-id',
			text: 'server',
		});
		container.innerHTML = html;

		hydrateRoot(container, cli.NotSuppressed, { id: 'client-id', text: 'client' });
		flushSync(() => {});

		const div = container.querySelector('div')!;
		expect(div.getAttribute('id')).toBe('client-id'); // patched
		expect(div.textContent).toBe('client'); // patched
		const warns = errSpy.mock.calls
			.map((c) => String(c[0]))
			.filter((m) => m.includes('hydration mismatch'));
		expect(warns.length).toBeGreaterThanOrEqual(2); // id + text
	});

	it('spread suppressHydrationWarning: keeps SERVER attr/class/text, no warning, no junk attribute', async () => {
		const srv = serverModule(SUPPRESS, 'suppress.tsrx');
		const cli = devClientModule(SUPPRESS, 'suppress.tsrx');
		const { html } = await ServerRT.renderToString(srv.SpreadSuppressed, {
			rest: { id: 'server-id', class: 'server-cls', suppressHydrationWarning: true },
			text: 'server',
		});
		// The opt-out is NOT serialized into the server HTML (ssrSpread skips it).
		expect(html).not.toContain('suppresshydrationwarning');
		container.innerHTML = html;

		hydrateRoot(container, cli.SpreadSuppressed, {
			rest: { id: 'client-id', class: 'client-cls', suppressHydrationWarning: true },
			text: 'client',
		});
		flushSync(() => {});

		const div = container.querySelector('div')!;
		// The flag is a JS stamp, not an attribute — writing it as an attribute would
		// itself be a guaranteed mismatch (the server skips the key).
		expect(div.hasAttribute('suppresshydrationwarning')).toBe(false);
		expect(div.getAttribute('id')).toBe('server-id'); // SERVER value kept
		expect(div.getAttribute('class')).toBe('server-cls'); // SERVER class kept
		expect(div.textContent).toBe('server'); // SERVER text kept
		const warns = errSpy.mock.calls
			.map((c) => String(c[0]))
			.filter((m) => m.includes('hydration mismatch'));
		expect(warns).toEqual([]); // suppressed
	});

	it('spread class mismatch (no suppress): patches to the client class + warns', async () => {
		const srv = serverModule(SUPPRESS, 'suppress.tsrx');
		const cli = devClientModule(SUPPRESS, 'suppress.tsrx');
		const { html } = await ServerRT.renderToString(srv.SpreadClassed, {
			rest: { class: 'server-cls' },
		});
		expect(html).toContain('class="server-cls"');
		container.innerHTML = html;

		hydrateRoot(container, cli.SpreadClassed, { rest: { class: 'client-cls' } });
		flushSync(() => {});

		const div = container.querySelector('div')!;
		expect(div.getAttribute('class')).toBe('client-cls'); // patched
		const warn = errSpy.mock.calls
			.map((c) => String(c[0]))
			.find((m) => m.includes('attribute `class`'));
		expect(warn).toBeTruthy();
		expect(warn).toContain('suppress.tsrx:');
		expect(warn).toContain('"server-cls"');
	});

	it('markerless `{expr}` text mismatch: patch + warn via the text hole slot LOC', async () => {
		const srv = serverModule(MARKERLESS, 'markerless-text.tsx');
		const cli = devClientModule(MARKERLESS, 'markerless-text.tsx');
		const { html } = await ServerRT.renderToString(srv.Counter, {});
		// Server rendered 0; tamper the server text so hydration sees a divergence.
		container.innerHTML = html.replace('>0<', '>9<');

		hydrateRoot(container, cli.Counter, {});
		flushSync(() => {});

		const span = container.querySelector('#c')!;
		expect(span.textContent).toBe('0'); // patched to the client value
		const warn = errSpy.mock.calls
			.map((c) => String(c[0]))
			.find((m) => m.includes('hydration mismatch'));
		expect(warn).toBeTruthy();
		expect(warn).toContain('markerless-text.tsx:');
	});
});
