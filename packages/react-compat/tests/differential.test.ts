// DIFFERENTIAL oracle. For each example we mount TWO trees from the SAME source:
//   • React side  — the original example compiled with real React (.react/*.mjs)
//   • Octane side — the bridged example compiled by octane   (.bridged/*.tsx)
// We drive an identical event sequence on both and assert byte-equal (after
// normalisation) innerHTML at every step. React is the oracle: if the bridge
// changed behaviour, a step diverges here. Normalisation mirrors the repo's own
// differential rig (strip Octane marker comments, collapse inter-tag whitespace,
// sort attributes) — DOM-emission cosmetics, not behaviour.
import { afterEach, describe, expect, it } from 'vitest';
import * as React from 'react';
import { act as reactAct } from 'react';
import { createRoot as reactCreateRoot } from 'react-dom/client';
import {
	createRoot as octaneCreateRoot,
	delegateEvents,
	drainPassiveEffects,
	flushSync,
} from 'octane';

delegateEvents(['click', 'input']);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── innerHTML normalisation (ported from tests/differential/_rig.ts) ─────────
function stripComments(s: string): string {
	let out = '';
	let i = 0;
	while (i < s.length) {
		const open = s.indexOf('<!--', i);
		if (open === -1) return out + s.slice(i);
		out += s.slice(i, open);
		const close = s.indexOf('-->', open + 4);
		if (close === -1) break;
		i = close + 3;
	}
	return out;
}
function collapseInterTagWhitespace(s: string): string {
	return s.replace(/>\s+/g, '>').replace(/\s+</g, '<');
}
function sortAttributes(html: string): string {
	return html.replace(/<([a-zA-Z][\w-]*)\s+([^>]*?)(\/?)>/g, (_, tag, attrs, selfClose) => {
		const parts =
			attrs.match(/(?:[a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?/g) || [];
		if (!parts.length) return `<${tag}${selfClose ? '/' : ''}>`;
		parts.sort();
		return `<${tag} ${parts.join(' ')}${selfClose ? '/' : ''}>`;
	});
}
function normalise(html: string): string {
	return sortAttributes(
		collapseInterTagWhitespace(stripComments(html))
			.replace(/ data-reactroot=""?/g, '')
			.replaceAll(' style=""', '')
			.trim(),
	);
}

// ── mounts ───────────────────────────────────────────────────────────────────
const disposers: Array<() => void> = [];
afterEach(() => {
	while (disposers.length) disposers.pop()!();
});

function mountOctane(Comp: unknown, props?: unknown) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = octaneCreateRoot(container);
	root.render(Comp as never, props as never);
	flushSync(() => {});
	drainPassiveEffects();
	disposers.push(() => {
		root.unmount();
		container.remove();
	});
	return {
		container,
		html: () => container.innerHTML,
		click: (sel: string) => flushSync(() => (container.querySelector(sel) as HTMLElement).click()),
		drain: () => {
			drainPassiveEffects();
			flushSync(() => {});
		},
	};
}

async function mountReact(Comp: unknown, props?: unknown) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = reactCreateRoot(container);
	await reactAct(async () => {
		root.render(React.createElement(Comp as never, props as never));
	});
	disposers.push(() => {
		reactAct(() => root.unmount());
		container.remove();
	});
	return {
		container,
		html: () => container.innerHTML,
		click: async (sel: string) => {
			await reactAct(async () => {
				(container.querySelector(sel) as HTMLElement).click();
			});
		},
	};
}

// Assert both sides' innerHTML match (with an optional label per step).
function same(a: { html: () => string }, b: { html: () => string }, step: string) {
	expect(normalise(a.html()), step).toBe(normalise(b.html()));
}

describe('react-compat differential (Octane bridged ≡ real React, byte-equal DOM)', () => {
	it('E1 counter — equal after each click', async () => {
		const o = mountOctane((await import('./.bridged/e1-counter.tsx')).Counter, { start: 5 });
		const r = await mountReact((await import('./.react/e1-counter.mjs')).Counter, { start: 5 });
		same(o, r, 'mount');
		o.click('button');
		await r.click('button');
		same(o, r, 'after click');
	});

	it('E2 context — equal after reducer dispatch', async () => {
		const o = mountOctane((await import('./.bridged/e2-context.tsx')).App);
		const r = await mountReact((await import('./.react/e2-context.mjs')).App);
		same(o, r, 'mount');
		o.click('button');
		await r.click('button');
		same(o, r, 'after bump');
	});

	it('E3 store — equal after external mutation', async () => {
		const oMod = await import('./.bridged/e3-store.tsx');
		const rMod = await import('./.react/e3-store.mjs');
		const oStore = oMod.createStore({ count: 0 });
		const rStore = rMod.createStore({ count: 0 });
		const o = mountOctane(oMod.CountView, { store: oStore });
		const r = await mountReact(rMod.CountView, { store: rStore });
		o.drain();
		same(o, r, 'mount');
		oStore.setState((s: { count: number }) => ({ count: s.count + 1 }));
		o.drain();
		await reactAct(async () => rStore.setState((s: { count: number }) => ({ count: s.count + 1 })));
		same(o, r, 'after mutate');
	});

	it('E5 portal — host content equal after toggle', async () => {
		const oMod = await import('./.bridged/e5-portal.tsx');
		const rMod = await import('./.react/e5-portal.mjs');
		const oHost = document.createElement('div');
		const rHost = document.createElement('div');
		document.body.append(oHost, rHost);
		disposers.push(
			() => oHost.remove(),
			() => rHost.remove(),
		);
		const o = mountOctane(oMod.Tooltip, { host: oHost });
		const r = await mountReact(rMod.Tooltip, { host: rHost });
		same(o, r, 'tooltip mount');
		expect(normalise(oHost.innerHTML)).toBe(normalise(rHost.innerHTML)); // both empty
		o.click('button');
		await r.click('button');
		expect(normalise(oHost.innerHTML), 'portal open').toBe(normalise(rHost.innerHTML));
	});

	it('E6 imperative — equal render, then equal after handle-driven step', async () => {
		const oMod = await import('./.bridged/e6-imperative.tsx');
		const rMod = await import('./.react/e6-imperative.mjs');
		const oRef: { current: { step: () => void } | null } = { current: null };
		const rRef: { current: { step: () => void } | null } = { current: null };
		const o = mountOctane(oMod.Stepper, { start: 10, ref: oRef });
		const r = await mountReact(rMod.Stepper, { start: 10, ref: rRef });
		same(o, r, 'mount');
		flushSync(() => oRef.current!.step());
		o.drain();
		await reactAct(async () => rRef.current!.step());
		same(o, r, 'after handle.step()');
	});

	it('E7 suspense — equal fallback, then equal revealed value', async () => {
		const oMod = await import('./.bridged/e7-suspense.tsx');
		const rMod = await import('./.react/e7-suspense.mjs');
		let oResolve!: (v: string) => void;
		let rResolve!: (v: string) => void;
		const oRes = new Promise<string>((res) => (oResolve = res));
		const rRes = new Promise<string>((res) => (rResolve = res));
		const o = mountOctane(oMod.App, { resource: oRes });
		const r = await mountReact(rMod.App, { resource: rRes });
		o.drain();
		same(o, r, 'fallback'); // both suspended → loading…
		oResolve('ready');
		for (let i = 0; i < 4; i++) {
			o.drain();
			await Promise.resolve();
		}
		await reactAct(async () => {
			rResolve('ready');
			await rRes;
		});
		same(o, r, 'revealed'); // both → data
	});

	it('E8 store-app — keyed list equal after each add', async () => {
		const o = mountOctane((await import('./.bridged/e8-store-app.tsx')).App);
		const r = await mountReact((await import('./.react/e8-store-app.mjs')).App);
		same(o, r, 'mount');
		o.click('button');
		await r.click('button');
		same(o, r, 'after add 1');
		o.click('button');
		await r.click('button');
		same(o, r, 'after add 2');
	});
});
