import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync, delegateEvents } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { Page } from './_fixtures/head.tsrx';

// Hoisted document metadata (React-19 model): inline `<title>`/`<meta>` are
// routed out of the body, so the remaining single body root takes the
// single-root path (no <octane-frag>) and the metadata folds into render().html
// (server, via ssrHeadEl → folded into html) / document.head (client, via headBlock). On hydrateRoot,
// headBlock ADOPTS the server-rendered element (matched by its `<!--key-->`
// marker) rather than appending a duplicate, and removes it on unmount.

delegateEvents(['click']);

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/head.tsrx');
// octane/compiler/vite normalizes modules inside Vite's root to root-relative
// ids so client/server builds (and installed symlink layouts) hash the same
// logical module path. Mirror that id for this manually evaluated server copy.
const VITE_FILENAME = '/' + relative(process.cwd(), FIXTURE).split(sep).join('/');
function serverModule(): Record<string, any> {
	// Compile with the SAME root-relative module id the client gets from the Vite plugin, so the
	// CSS scope hash (which includes the filename) matches both sides — exactly as in a real
	// app where client + server compile the same path. (A short name here desynced the hash,
	// which the structural-mismatch static-attribute check would then flag + rebuild.)
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), VITE_FILENAME, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
}
const server = serverModule();

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => {
	container.remove();
	// Reset the document head between tests (title + any adopted/mounted nodes).
	document.head.innerHTML = '';
	document.title = '';
});

describe('hoisted document metadata — compile', () => {
	it('client: single-root body template (no <octane-frag>) + headBlock', () => {
		const { code } = compile(readFileSync(FIXTURE, 'utf8'), 'head.tsrx', { mode: 'client' });
		expect(code).not.toContain('octane-frag');
		expect(code).toContain('headBlock(__s,');
		expect(code).toMatch(/import \{[^}]*\bheadBlock\b/);
	});

	it('server: ssrHeadEl with a key byte-identical to the client headBlock', () => {
		const { code: clientCode } = compile(readFileSync(FIXTURE, 'utf8'), 'head.tsrx', {
			mode: 'client',
		});
		const { code: serverCode } = compile(readFileSync(FIXTURE, 'utf8'), 'head.tsrx', {
			mode: 'server',
		});
		// The first head element is the <title>; its content key (3rd arg, after the
		// scope slot index) must match the server `ssrHeadEl` key across modes.
		const key = clientCode.match(/headBlock\(__s, \d+, ["'](rnh-[a-z0-9]+)["']/)?.[1];
		expect(key).toBeTruthy();
		expect(
			serverCode.includes(`ssrHeadEl("${key}"`) || serverCode.includes(`ssrHeadEl('${key}'`),
		).toBe(true);
	});
});

describe('hoisted document metadata — SSR', () => {
	it('html carries the title + meta (each marker-prefixed) folded to the front; body is single-root', () => {
		const { html, css } = ServerRT.renderToString(server.Page, { params: {} });
		expect(html).toContain('<title>TSRX Page</title>');
		expect(html).toContain('name="description"');
		expect(html).toContain('content="A test page"');
		// Head metadata folds to the FRONT of html (a body-only render has no
		// <head> to splice into), each still prefixed by its adoption marker.
		expect(html).toMatch(/^<!--rnh-/);
		expect(html.indexOf('<title')).toBeLessThan(html.indexOf('<section'));
		// Body is the single <section>, NOT a <octane-frag> multi-root.
		expect(html).toContain('<section id="body"');
		expect(html).not.toContain('octane-frag');
		// The <style> still routes to CSS.
		expect(css).toContain('rebeccapurple');
	});
});

describe('hoisted document metadata — hydration', () => {
	it('adopts the server head (one <title>/<meta>, markers removed) + single-root body, removed on unmount', () => {
		const { html } = ServerRT.renderToString(server.Page, { params: {} });
		// html folds head metadata to the front + body after. A document places the
		// head part in <head> and the body part in the app container — split there.
		const bodyStart = html.indexOf('<section');
		const head = html.slice(0, bodyStart);
		const body = html.slice(bodyStart);
		document.head.innerHTML = head;
		expect(document.head.querySelectorAll('title').length).toBe(1);
		expect(document.title).toBe('TSRX Page');

		container.innerHTML = body;
		const section = container.querySelector('#body') as HTMLElement;
		const btn = container.querySelector('#bump') as HTMLButtonElement;

		const root = hydrateRoot(container, Page, { params: {} });
		flushSync(() => {});

		// Head: title + meta ADOPTED (no duplication), adoption markers removed.
		expect(document.title).toBe('TSRX Page');
		expect(document.head.querySelectorAll('title').length).toBe(1);
		expect(document.head.querySelectorAll('meta[name="description"]').length).toBe(1);
		const markerComments = Array.from(document.head.childNodes).filter(
			(n) => n.nodeType === 8 && (n as Comment).data.startsWith('rnh-'),
		);
		expect(markerComments.length).toBe(0);

		// Body: single-root <section> ADOPTED (same node), no <octane-frag>, interactive.
		expect(container.querySelector('#body')).toBe(section);
		expect(container.querySelector('octane-frag')).toBeNull();
		flushSync(() => btn.click());
		expect(btn.textContent).toBe('n:1');

		// Lifecycle: unmounting the page removes its hoisted head elements.
		root.unmount();
		expect(document.head.querySelectorAll('title').length).toBe(0);
		expect(document.head.querySelectorAll('meta[name="description"]').length).toBe(0);
	});

	it('skips an interposed foreign element and adopts the intended head element', () => {
		const { html } = ServerRT.renderToString(server.Page, { params: {} });
		const bodyStart = html.indexOf('<section');
		document.head.innerHTML = html.slice(0, bodyStart);
		container.innerHTML = html.slice(bodyStart);

		const title = document.head.querySelector('title')!;
		const meta = document.head.querySelector('meta[name="description"]')!;
		const foreign = document.createElement('script');
		foreign.type = 'application/json';
		foreign.textContent = '{"foreign":true}';
		// The title marker remains immediately before this foreign node. A head
		// claimant must validate the expected tag instead of owning the next element.
		document.head.insertBefore(foreign, title);

		const root = hydrateRoot(container, Page, { params: {} });
		flushSync(() => {});

		expect(foreign.isConnected).toBe(true);
		expect(foreign.textContent).toBe('{"foreign":true}');
		expect(document.head.querySelector('title')).toBe(title);
		expect(document.head.querySelector('meta[name="description"]')).toBe(meta);
		expect(document.head.querySelectorAll('title')).toHaveLength(1);
		expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);

		root.unmount();
		expect(foreign.isConnected).toBe(true);
		expect(title.isConnected).toBe(false);
		expect(meta.isConnected).toBe(false);
	});

	it('creates a missing expected head element without claiming a wrong-tag neighbor', () => {
		const { html } = ServerRT.renderToString(server.Page, { params: {} });
		const bodyStart = html.indexOf('<section');
		document.head.innerHTML = html.slice(0, bodyStart);
		container.innerHTML = html.slice(bodyStart);

		const missingTitle = document.head.querySelector('title')!;
		const meta = document.head.querySelector('meta[name="description"]')!;
		const foreign = document.createElement('script');
		foreign.type = 'application/json';
		foreign.textContent = '{"foreign":true}';
		document.head.insertBefore(foreign, missingTitle);
		missingTitle.remove();

		const root = hydrateRoot(container, Page, { params: {} });
		flushSync(() => {});

		const createdTitle = document.head.querySelector('title')!;
		expect(createdTitle).not.toBe(missingTitle);
		expect(createdTitle.textContent).toBe('TSRX Page');
		expect(document.head.querySelectorAll('title')).toHaveLength(1);
		expect(document.head.querySelector('meta[name="description"]')).toBe(meta);
		expect(foreign.isConnected).toBe(true);
		expect(foreign.textContent).toBe('{"foreign":true}');

		root.unmount();
		expect(createdTitle.isConnected).toBe(false);
		expect(meta.isConnected).toBe(false);
		expect(foreign.isConnected).toBe(true);
	});
});
