import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// Hydration VALUE mismatches (text + attribute), as in React. A server text that
// differs from the client's does not match: with no Suspense or Hydrate boundary
// the root discards its server DOM, renders on the client, and reports once to
// onRecoverableError. A differing attribute or class is never patched: the
// server value stays, and development warns once with the source location
// (`file:line:col`). `suppressHydrationWarning` keeps both server values
// silently. Each case server-renders with one set of props and hydrates with
// another.

const LEAF = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/leaf.tsrx');
const MARKERLESS = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/markerless-text.tsx',
);
const SUPPRESS = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/suppress.tsrx');
const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;

function serverModule(fixture: string, file: string): Record<string, any> {
	return loadServerFixture(fixture, { id: file });
}

// These diagnostic cases explicitly opt into development compilation in both projects.
function devClientModule(fixture: string, file: string): Record<string, any> {
	return loadCompiledFixtureSource(readFileSync(fixture, 'utf8'), {
		id: file,
		mode: 'client',
		compileOptions: { dev: true },
	});
}

describe('hydrateRoot — VALUE mismatch (text + attribute) fallback/keep/warn', () => {
	const server = serverModule(LEAF, 'leaf.tsrx');
	const clientDev = devClientModule(LEAF, 'leaf.tsrx');
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

	function hydrate(component: unknown, props: Record<string, unknown>): void {
		root = hydrateRoot(container, component as never, props as never, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
	}

	const warnings = (): string[] =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	it('renders the root on the client for a TEXT mismatch + warns with LOC', async () => {
		const { html } = await ServerRT.renderToString(server.Attrs, {
			id: 'a',
			cls: 'c',
			text: 'server',
		});
		expect(html).toContain('>server</div>');
		container.innerHTML = html;
		const served = container.querySelector('div')!;

		hydrate(clientDev.Attrs, { id: 'a', cls: 'c', text: 'client' });
		await Promise.resolve();

		const div = container.querySelector('div')!;
		expect(div).not.toBe(served);
		expect(div.textContent).toBe('client');
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		const textWarn = warnings().find((m) => m.includes('"server"'));
		expect(textWarn).toBeTruthy();
		expect(textWarn).toContain('leaf.tsrx:'); // source location present
		expect(textWarn).toContain('"client"');
	});

	it('keeps the server ATTRIBUTE value + warns with LOC', async () => {
		const { html } = await ServerRT.renderToString(server.Attrs, {
			id: 'server-id',
			cls: 'c',
			text: 't',
		});
		expect(html).toContain('id="server-id"');
		container.innerHTML = html;
		const served = container.querySelector('div')!;

		hydrate(clientDev.Attrs, { id: 'client-id', cls: 'c', text: 't' });

		const div = container.querySelector('div')!;
		expect(div).toBe(served);
		expect(div.getAttribute('id')).toBe('server-id'); // never patched
		expect(recoverable).toEqual([]);
		const attrWarn = warnings().find((m) => m.includes('attribute `id`'));
		expect(attrWarn).toBeTruthy();
		expect(attrWarn).toContain("This won't be patched up.");
		expect(attrWarn).toContain('leaf.tsrx:');
		expect(attrWarn).toContain('the server rendered "server-id", the client "client-id"');

		// The next client change writes its value.
		flushSync(() => root!.render(clientDev.Attrs, { id: 'next-id', cls: 'c', text: 't' }));
		expect(div.getAttribute('id')).toBe('next-id');
	});

	it('does NOT warn when server and client agree (DOM untouched)', async () => {
		const { html } = await ServerRT.renderToString(server.Attrs, {
			id: 'a',
			cls: 'c',
			text: 'same',
		});
		container.innerHTML = html;
		const before = container.innerHTML;

		hydrate(clientDev.Attrs, { id: 'a', cls: 'c', text: 'same' });

		expect(container.innerHTML).toBe(before);
		expect(warnings()).toEqual([]);
		expect(recoverable).toEqual([]);
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

		hydrate(cli.Suppressed, { id: 'client-id', text: 'client' });

		const div = container.querySelector('div')!;
		expect(div.getAttribute('id')).toBe('server-id'); // SERVER value kept
		expect(div.textContent).toBe('server'); // SERVER value kept
		expect(warnings()).toEqual([]); // suppressed
		expect(recoverable).toEqual([]);
	});

	it('control (no suppress): the same text mismatch renders the root on the client', async () => {
		const srv = serverModule(SUPPRESS, 'suppress.tsrx');
		const cli = devClientModule(SUPPRESS, 'suppress.tsrx');
		const { html } = await ServerRT.renderToString(srv.NotSuppressed, {
			id: 'server-id',
			text: 'server',
		});
		container.innerHTML = html;
		const served = container.querySelector('div')!;

		hydrate(cli.NotSuppressed, { id: 'client-id', text: 'client' });
		await Promise.resolve();

		const div = container.querySelector('div')!;
		expect(div).not.toBe(served);
		expect(div.getAttribute('id')).toBe('client-id'); // client-rendered
		expect(div.textContent).toBe('client'); // client-rendered
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual([expect.stringContaining('suppress.tsrx:')]);
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

		hydrate(cli.SpreadSuppressed, {
			rest: { id: 'client-id', class: 'client-cls', suppressHydrationWarning: true },
			text: 'client',
		});

		const div = container.querySelector('div')!;
		// The flag is a JS stamp, not an attribute — writing it as an attribute would
		// itself be a guaranteed mismatch (the server skips the key).
		expect(div.hasAttribute('suppresshydrationwarning')).toBe(false);
		expect(div.getAttribute('id')).toBe('server-id'); // SERVER value kept
		expect(div.getAttribute('class')).toBe('server-cls'); // SERVER class kept
		expect(div.textContent).toBe('server'); // SERVER text kept
		expect(warnings()).toEqual([]); // suppressed
		expect(recoverable).toEqual([]);
	});

	it('spread class mismatch (no suppress): keeps the server class + warns', async () => {
		const srv = serverModule(SUPPRESS, 'suppress.tsrx');
		const cli = devClientModule(SUPPRESS, 'suppress.tsrx');
		const { html } = await ServerRT.renderToString(srv.SpreadClassed, {
			rest: { class: 'server-cls' },
		});
		expect(html).toContain('class="server-cls"');
		container.innerHTML = html;
		const served = container.querySelector('div')!;

		hydrate(cli.SpreadClassed, { rest: { class: 'client-cls' } });

		const div = container.querySelector('div')!;
		expect(div).toBe(served);
		expect(div.getAttribute('class')).toBe('server-cls'); // never patched
		expect(recoverable).toEqual([]);
		const warn = warnings().find((m) => m.includes('attribute `class`'));
		expect(warn).toBeTruthy();
		expect(warn).toContain('suppress.tsrx:');
		expect(warn).toContain('the server rendered "server-cls", the client "client-cls"');
	});

	it('markerless `{expr}` text mismatch: renders the root on the client + warns via the text hole LOC', async () => {
		const srv = serverModule(MARKERLESS, 'markerless-text.tsx');
		const cli = devClientModule(MARKERLESS, 'markerless-text.tsx');
		const { html } = await ServerRT.renderToString(srv.Counter, {});
		// Server rendered 0; tamper the server text so hydration sees a divergence.
		container.innerHTML = html.replace('>0<', '>9<');
		const served = container.querySelector('#c')!;

		hydrate(cli.Counter, {});
		await Promise.resolve();

		const span = container.querySelector('#c')!;
		expect(span).not.toBe(served);
		expect(span.textContent).toBe('0'); // the client's text
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		const warn = warnings().find((m) => m.includes('markerless-text.tsx:'));
		expect(warn).toBeTruthy();
	});
});
