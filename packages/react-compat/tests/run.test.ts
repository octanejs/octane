// The end-to-end proof. Each `runtime` test dynamic-imports a BRIDGED example
// (unmodified React source → codemod, produced by _setup.mjs), which the
// octane() plugin compiles on import, then mounts it on Octane and drives it.
// If React source truly runs on Octane through the compat pipeline, these pass.
//
// The `detector` tests pin the static classification: E1–E3 auto-bridge, E4 is
// the wall (class component blocked, controlled input flagged).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, delegateEvents, drainPassiveEffects, flushSync, type Root } from 'octane';
import { detect } from '../src/detect.mjs';

delegateEvents(['click', 'input']);

const disposers: Array<() => void> = [];
afterEach(() => {
	while (disposers.length) disposers.pop()!();
});

function render(body: unknown, props?: unknown) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root: Root = createRoot(container);
	root.render(body as never, props as never);
	flushSync(() => {});
	drainPassiveEffects(); // run mount effects (e.g. useSyncExternalStore subscribe)
	disposers.push(() => {
		root.unmount();
		container.remove();
	});
	return {
		container,
		html: () => container.innerHTML,
		text: (sel: string) => container.querySelector(sel)?.textContent ?? '',
		all: (sel: string) => Array.from(container.querySelectorAll(sel)).map((e) => e.textContent),
		click: (sel: string) => flushSync(() => (container.querySelector(sel) as HTMLElement).click()),
	};
}

// Drain effects + flush + let queued work run over a few microtask ticks — for
// async paths (Suspense reveal) where a single drain isn't enough.
async function settle() {
	for (let i = 0; i < 4; i++) {
		drainPassiveEffects();
		flushSync(() => {});
		await Promise.resolve();
	}
}

describe('react-compat runtime (React source → codemod → Octane compiler → mount)', () => {
	it('E1 — useState counter renders and updates on click', async () => {
		const { Counter } = await import('./.bridged/e1-counter.tsx');
		const r = render(Counter, { start: 5 });
		expect(r.html()).toContain('count: 5');
		r.click('button');
		expect(r.html()).toContain('count: 6');
	});

	it('E2 — context propagates Provider→consumer; reducer + memo update', async () => {
		const { App } = await import('./.bridged/e2-context.tsx');
		const r = render(App);
		expect(r.text('.label')).toBe('dark:0');
		r.click('button');
		expect(r.text('.label')).toBe('dark:1');
	});

	it('E3 — useSyncExternalStore binding tracks external store mutations', async () => {
		// Mirror Octane's own store-tearing conformance idiom: drain effects then
		// let the queued notify flush on a microtask tick (its `nextPaint()`).
		const tick = async () => {
			drainPassiveEffects();
			await Promise.resolve();
		};
		const mod = await import('./.bridged/e3-store.tsx');
		const store = mod.createStore({ count: 0 });
		const r = render(mod.CountView, { store });
		await tick();
		expect(r.text('.view')).toBe('0');
		store.setState((s: { count: number }) => ({ count: s.count + 1 }));
		await tick();
		expect(r.text('.view')).toBe('1');
	});

	it('E5 — react-dom createPortal renders children into the portal host', async () => {
		const { Tooltip } = await import('./.bridged/e5-portal.tsx');
		const host = document.createElement('div');
		document.body.appendChild(host);
		disposers.push(() => host.remove());
		const r = render(Tooltip, { host });
		expect(host.querySelector('.pop')).toBeNull();
		r.click('button');
		expect(host.querySelector('.pop')?.textContent).toBe('hello');
	});

	it('E6 — forwardRef exposes an imperative handle through a ref prop', async () => {
		const { Stepper } = await import('./.bridged/e6-imperative.tsx');
		const handle: { current: { step: () => void; get: () => number } | null } = { current: null };
		const r = render(Stepper, { start: 10, ref: handle });
		expect(r.text('.n')).toBe('10');
		expect(handle.current).toBeTruthy();
		flushSync(() => handle.current!.step());
		drainPassiveEffects();
		expect(r.text('.n')).toBe('11');
		expect(handle.current!.get()).toBe(11);
	});

	it('E7 — Suspense shows fallback, then reveals on use(promise) resolution', async () => {
		const { App } = await import('./.bridged/e7-suspense.tsx');
		let resolve!: (v: string) => void;
		const resource = new Promise<string>((r) => (resolve = r));
		const r = render(App, { resource });
		await settle();
		expect(r.text('.loading')).toBe('loading…');
		expect(r.text('.data')).toBe('');
		resolve('ready');
		await settle();
		expect(r.text('.data')).toBe('ready');
	});

	it('E8 — context + reducer + keyed list grows on dispatch', async () => {
		const { App } = await import('./.bridged/e8-store-app.tsx');
		const r = render(App);
		expect(r.all('.item')).toEqual(['first']);
		r.click('button');
		expect(r.all('.item')).toEqual(['first', 'item']);
		r.click('button');
		expect(r.all('.item')).toEqual(['first', 'item', 'item']);
	});
});

// process.cwd() is the repo root under vitest (import.meta.url is rewritten by
// Vite to a server-root-relative path, so it can't be used for a real fs read).
const exampleSource = (name: string) =>
	readFileSync(join(process.cwd(), 'packages/react-compat/examples', name), 'utf8');

describe('react-compat detector (static classification)', () => {
	it('every bridgeable example auto-bridges (E1–E3, E5–E8)', () => {
		for (const name of [
			'e1-counter',
			'e2-context',
			'e3-store',
			'e5-portal',
			'e6-imperative',
			'e7-suspense',
			'e8-store-app',
		]) {
			expect(detect(exampleSource(`${name}.tsx`)).verdict).toBe('bridgeable-autofix');
		}
	});

	it('E4 is the wall: class component blocks, controlled input flags, forwardRef autofixes', () => {
		const r = detect(exampleSource('e4-hard.tsx'));
		expect(r.verdict).toBe('needs-rework');
		const byId = (id: string) => r.findings.find((f) => f.ruleId === id);
		expect(byId('class-component')?.severity).toBe(3); // block
		expect(byId('controlled-input')?.severity).toBe(2); // flag
		expect(byId('forwardRef')?.severity).toBe(1); // autofix
	});

	it('E5 routes createPortal through the react-dom re-home rule', () => {
		const r = detect(exampleSource('e5-portal.tsx'));
		expect(r.findings.some((f) => f.ruleId === 'react-dom-rehome')).toBe(true);
	});

	it('E6 flags forwardRef for the refs-as-props autofix', () => {
		const r = detect(exampleSource('e6-imperative.tsx'));
		expect(r.findings.some((f) => f.ruleId === 'forwardRef')).toBe(true);
	});
});
