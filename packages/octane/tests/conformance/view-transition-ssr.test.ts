/**
 * Port of facebook/react ReactDOMFizzViewTransition-test.js (2026-07-11) —
 * the SSR side of View Transitions: the server emits resolved `vt-*`
 * annotations (vt-name / vt-update / vt-enter / vt-exit / vt-share) on each
 * boundary's first element so streamed reveals can animate pre-hydration, and
 * hydration adopts the annotated markup without complaint. 4 in-scope cases,
 * all ported (view-transitions plan Phase 5).
 *
 * Octane notes: @try/@pending is the directive form of React's <Suspense>;
 * auto names are `_O<frame-path>_` (stable across streaming passes) rather
 * than React's `_R_0_`; assertions are attribute-based, not markup-shaped.
 * The streaming harness mirrors streaming-ssr.test.ts (server-compiled
 * fixture via Function eval, chunk collector, activate() running the swap
 * scripts the way a browser would).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot } from '../../src/index.js';
import * as ServerRT from '../../src/server/index.js';
// CLIENT-compiled fixture (for hydration).
import { AnnotationsApp, ArmsApp, DualApp, OutsideApp } from './_fixtures/view-transition-ssr.tsrx';

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/conformance/_fixtures/view-transition-ssr.tsrx',
);

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), FIXTURE, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = $1; function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
}
const server = serverModule();

function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function collector() {
	const chunks: string[] = [];
	let end!: () => void;
	const ended = new Promise<void>((res) => (end = res));
	return {
		chunks,
		ended,
		dest: { write: (c: string) => chunks.push(c), end: () => end() },
	};
}

/** Execute the stream's inline swap scripts the way a browser would. */
function activate(root: HTMLElement): void {
	for (const s of Array.from(root.querySelectorAll('script'))) {
		if (s.getAttribute('type') === 'application/json') continue;
		(0, eval)(s.textContent || '');
		s.remove();
	}
}

const vt = (el: Element | null) => {
	if (el === null) return null;
	const out: Record<string, string> = {};
	for (const a of Array.from(el.attributes)) {
		if (a.name.startsWith('vt-')) out[a.name] = a.value;
	}
	return out;
};

describe('ReactDOMFizzViewTransition (ported)', () => {
	let container: HTMLElement;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errorSpy = vi.spyOn(console, 'error');
	});
	afterEach(() => {
		// Hydration must not yield any errors/mismatch warnings (React's check).
		expect(errorSpy).not.toHaveBeenCalled();
		errorSpy.mockRestore();
		container.remove();
		delete (window as any).$OCTS;
		delete (window as any).$OCTRC;
		delete (window as any).$OCTRX;
	});

	// Per ReactDOMFizzViewTransition-test.js:99
	it('emits annotations for view transitions', async () => {
		const { html } = ServerRT.renderToString(server.AnnotationsApp, {});
		container.innerHTML = html;

		const root = container.firstElementChild!;
		const kids = Array.from(root.children);
		expect(kids).toHaveLength(4);
		expect(vt(kids[0])).toEqual({ 'vt-update': 'auto' });
		expect(vt(kids[1])).toEqual({ 'vt-name': 'foo', 'vt-update': 'bar', 'vt-share': 'auto' });
		expect(vt(kids[2])).toEqual({ 'vt-update': 'baz' });
		// Nested boundary inside the named outer: innermost owns vt-update; the
		// outer contributes name + share.
		expect(vt(kids[3])).toEqual({ 'vt-name': 'outer', 'vt-update': 'auto', 'vt-share': 'pair' });

		// Hydration should not yield any errors (checked in afterEach).
		const root2 = hydrateRoot(container, AnnotationsApp, {});
		root2.unmount();
		container.innerHTML = '';
	});

	// Per ReactDOMFizzViewTransition-test.js:142
	it('emits enter/exit annotations for view transitions inside Suspense', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.ArmsApp, { promise: d.promise });
		pipe(c.dest);

		// Shell: the fallback root exits on reveal; the nested boundary is plain.
		const shell = document.createElement('div');
		shell.innerHTML = c.chunks[0];
		const shellAnnotated = shell.querySelectorAll('[vt-update]');
		expect(shellAnnotated).toHaveLength(2);
		expect(vt(shellAnnotated[0])).toEqual({ 'vt-update': 'auto', 'vt-exit': 'auto' });
		expect(shellAnnotated[1].tagName).toBe('SPAN');
		expect(vt(shellAnnotated[1])).toEqual({ 'vt-update': 'auto' });

		d.resolve('Content');
		await c.ended;
		container.innerHTML = c.chunks.join('');
		activate(container);

		// Revealed content: the content root enters; the nested boundary is plain.
		const annotated = container.querySelectorAll('[vt-update]');
		expect(annotated).toHaveLength(2);
		expect(vt(annotated[0])).toEqual({ 'vt-update': 'auto', 'vt-enter': 'auto' });
		expect(vt(annotated[1])).toEqual({ 'vt-update': 'auto' });
		expect(container.querySelector('span')!.textContent).toBe('Content');

		const root = hydrateRoot(container, ArmsApp, { promise: d.promise });
		await Promise.resolve();
		root.unmount();
		container.innerHTML = '';
	});

	// Per ReactDOMFizzViewTransition-test.js:207
	it('can emit both enter and exit on the same node', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.DualApp, { promise: d.promise });
		pipe(c.dest);

		// The fallback's boundary is Suspense CONTENT (inner @try) inside the
		// outer FALLBACK arm — it both enters and exits.
		const shell = document.createElement('div');
		shell.innerHTML = c.chunks[0];
		const shellAnnotated = shell.querySelectorAll('[vt-update]');
		expect(shellAnnotated).toHaveLength(2);
		expect(vt(shellAnnotated[0])).toEqual({
			'vt-update': 'auto',
			'vt-enter': 'hello',
			'vt-exit': 'goodbye',
		});
		expect(vt(shellAnnotated[1])).toEqual({ 'vt-update': 'auto' });

		d.resolve('Content');
		await c.ended;
		container.innerHTML = c.chunks.join('');
		activate(container);

		const annotated = container.querySelectorAll('[vt-update]');
		expect(annotated).toHaveLength(2);
		expect(vt(annotated[0])).toEqual({ 'vt-update': 'auto', 'vt-enter': 'hi' });
		expect(container.querySelector('span')!.textContent).toBe('Content');

		const root = hydrateRoot(container, DualApp, { promise: d.promise });
		await Promise.resolve();
		root.unmount();
		container.innerHTML = '';
	});

	// Per ReactDOMFizzViewTransition-test.js:274
	it('emits annotations for view transitions outside Suspense', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.OutsideApp, { promise: d.promise });
		pipe(c.dest);

		// The wrapping boundary pairs fallback and content across the swap: BOTH
		// captures carry the same auto vt-name + vt-share.
		const shell = document.createElement('div');
		shell.innerHTML = c.chunks[0];
		const shellAnnotated = shell.querySelectorAll('[vt-update]');
		expect(shellAnnotated).toHaveLength(2);
		const fbAttrs = vt(shellAnnotated[0])!;
		expect(fbAttrs['vt-name']).toMatch(/^_O[\d/-]*_$/);
		expect(fbAttrs['vt-update']).toBe('auto');
		expect(fbAttrs['vt-share']).toBe('auto');
		expect(fbAttrs['vt-enter']).toBeUndefined();
		expect(fbAttrs['vt-exit']).toBeUndefined();
		expect(vt(shellAnnotated[1])).toEqual({ 'vt-update': 'auto' });

		d.resolve('Content');
		await c.ended;
		container.innerHTML = c.chunks.join('');
		activate(container);

		const annotated = container.querySelectorAll('[vt-update]');
		expect(annotated).toHaveLength(2);
		const cAttrs = vt(annotated[0])!;
		// The SAME stable name on the new capture (frame-path derived).
		expect(cAttrs['vt-name']).toBe(fbAttrs['vt-name']);
		expect(cAttrs['vt-update']).toBe('auto');
		expect(cAttrs['vt-share']).toBe('auto');
		expect(vt(annotated[1])).toEqual({ 'vt-update': 'auto' });
		expect(container.querySelector('span')!.textContent).toBe('Content');

		const root = hydrateRoot(container, OutsideApp, { promise: d.promise });
		await Promise.resolve();
		root.unmount();
		container.innerHTML = '';
	});
});
