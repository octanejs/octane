import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { Page, NestedPage, RouterShape } from './_fixtures/trycatch-client-error.tsrx';

// The server rendered a @try's SUCCESS arm, but on the client the try body throws
// during hydration (the live report: a route module failed to import on a hot dev
// server, so the router's CatchBoundary had to mount its error UI mid-hydration).
// The boundary must switch to its @catch arm without crashing and without eating
// DOM outside the slot: previously a rethrowing inner @catch made the outer
// boundary switch arms synchronously while the frames between them were still
// mounting (stale anchors → an insertBefore NotFoundError that REPLACED the real
// error and blanked the page), and the client-built catch arm consumed the
// misaligned adoption cursor (false structural mismatches + sibling DOM swept).

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/trycatch-client-error.tsrx',
);

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'trycatch-client-error.tsrx', {
		mode: 'server',
	});
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}
const server = serverModule();

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

describe('hydrateRoot — try body throws during hydration, @catch mounts', () => {
	it('mounts the @catch arm, keeps surrounding DOM, and no exception escapes', async () => {
		const { html } = await ServerRT.renderToString(server.Page, { boom: false });
		expect(html).toContain('<button id="ok"');
		container.innerHTML = html;

		// Hydrate with boom:true → the try body throws while adopting the server DOM.
		let root!: ReturnType<typeof hydrateRoot>;
		expect(() => {
			root = hydrateRoot(container, Page, { boom: true });
			flushSync(() => {});
		}).not.toThrow();

		// The @catch arm is mounted with the caught error...
		const msg = container.querySelector('.msg');
		expect(msg).not.toBeNull();
		expect(msg!.textContent).toBe('caught:boom');
		// ...the stale success arm is gone (not duplicated)...
		expect(container.querySelector('#ok')).toBeNull();
		// ...and the DOM around the boundary survived intact.
		expect(container.querySelector('#page')).not.toBeNull();
		expect(container.querySelector('#before')!.textContent).toBe('Title');
		expect(container.querySelector('#after')!.textContent).toBe('after');
		root.unmount();
	});

	it('the mounted @catch arm is interactive: reset() re-renders the try body', async () => {
		const { html } = await ServerRT.renderToString(server.Page, { boom: false });
		container.innerHTML = html;

		const root = hydrateRoot(container, Page, { boom: false });
		flushSync(() => {});
		// Server and client agree here — the success arm was adopted.
		const ok = container.querySelector('#ok') as HTMLButtonElement;
		expect(ok).not.toBeNull();
		flushSync(() => ok.click());
		expect(ok.textContent).toBe('ok:1');
		root.unmount();
	});

	it('nested boundaries (router Match shape): the INNER @catch mounts, outer content survives', async () => {
		const { html } = await ServerRT.renderToString(server.NestedPage, { boom: false });
		expect(html).toContain('<button id="ok"');
		container.innerHTML = html;

		let root!: ReturnType<typeof hydrateRoot>;
		expect(() => {
			root = hydrateRoot(container, NestedPage, { boom: true });
			flushSync(() => {});
		}).not.toThrow();

		// The inner boundary caught — its catch UI is up, the outer one is not.
		const inner = container.querySelector('.inner-err');
		expect(inner).not.toBeNull();
		expect(inner!.textContent).toBe('inner:boom');
		expect(container.querySelector('.outer-err')).toBeNull();
		expect(container.querySelector('#ok')).toBeNull();
		// The outer boundary's own content and the page around it survived.
		expect(container.querySelector('section.outer')).not.toBeNull();
		expect(container.querySelector('#outer-tail')!.textContent).toBe('tail');
		expect(container.querySelector('#before')!.textContent).toBe('Title');
		expect(container.querySelector('#after')!.textContent).toBe('after');
		root.unmount();
	});

	// The live report's full pipeline: outer boundary > @if > inner boundary whose
	// @catch RETHROWS. The rethrow crosses the @if's still-live mount frames — the
	// outer arm switch must not sweep the @if's anchors while its mount is still on
	// the stack (that produced an insertBefore NotFoundError that REPLACED the real
	// error and blanked the page).
	it('router shape: a rethrowing inner @catch reaches the outer @catch during hydration', async () => {
		const { html } = await ServerRT.renderToString(server.RouterShape, {
			show: true,
			boom: false,
		});
		expect(html).toContain('<button id="ok"');
		container.innerHTML = html;

		let root!: ReturnType<typeof hydrateRoot>;
		expect(() => {
			root = hydrateRoot(container, RouterShape, { show: true, boom: true });
			flushSync(() => {});
		}).not.toThrow();

		const msg = container.querySelector('.msg');
		expect(msg).not.toBeNull();
		expect(msg!.textContent).toBe('outer:boom');
		expect(container.querySelector('#ok')).toBeNull();
		expect(container.querySelector('#before')!.textContent).toBe('Title');
		expect(container.querySelector('#after')!.textContent).toBe('after');
		root.unmount();
	});

	it('router shape: reset() while the leaf still throws re-catches the ORIGINAL error (no crash)', async () => {
		// The website sequence: hydration mounted the outer catch UI, then the
		// boundary resets (the router's loadedAt reset key rolls) and the re-mounted
		// try body throws AGAIN because the route module is still broken.
		const { html } = await ServerRT.renderToString(server.RouterShape, {
			show: true,
			boom: false,
		});
		container.innerHTML = html;

		let root!: ReturnType<typeof hydrateRoot>;
		expect(() => {
			root = hydrateRoot(container, RouterShape, { show: true, boom: true });
			flushSync(() => {});
		}).not.toThrow();
		const retry = container.querySelector('.retry') as HTMLButtonElement;
		expect(retry).not.toBeNull();

		// Client-side re-mount of the try arm — the leaf throws, the inner catch
		// rethrows, and the outer catch must show the ORIGINAL error again.
		expect(() => flushSync(() => retry.click())).not.toThrow();
		const msg = container.querySelector('.msg');
		expect(msg).not.toBeNull();
		expect(msg!.textContent).toBe('outer:boom');
		expect(container.querySelector('#before')!.textContent).toBe('Title');
		expect(container.querySelector('#after')!.textContent).toBe('after');
		root.unmount();
	});
});
