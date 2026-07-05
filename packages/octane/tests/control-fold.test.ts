import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { hydrateRoot, flushSync } from '../src/index.js';
import { RetToggle, AtToggle } from './_fixtures/control-fold.tsrx';
import { Count as RetCount } from './_fixtures/return-count.tsrx';
import { AtBraceCount } from './_fixtures/atbrace-count.tsrx';

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/control-fold.tsrx');
function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'control-fold.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, 'const $1 = __exports.$1 = function $1');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}

// Stage 1 of the @{} fold: a return-JSX host element containing `@if` folds to the
// return-based fragment model. The fold's contract is that it produces DOM
// byte-identical to the inline `@{}` form (AtToggle) and updates identically — the
// `@{}` form is the oracle. (Selectors use the tag/class, not the shared `id="hit"`,
// to avoid a jsdom duplicate-id quirk when both components are mounted at once.)
describe('folded @if (return-JSX) matches the inline @{} oracle', () => {
	it('byte-equal DOM on mount (taken branch)', () => {
		const a = mount(RetToggle as any, { on: true });
		const b = mount(AtToggle as any, { on: true });
		expect(a.html()).toBe(b.html());
		expect(a.find('button').textContent).toBe('on:0');
		a.unmount();
		b.unmount();
	});

	it('byte-equal DOM on the @else branch', () => {
		const a = mount(RetToggle as any, { on: false });
		const b = mount(AtToggle as any, { on: false });
		expect(a.html()).toBe(b.html());
		expect(a.find('.off').textContent).toBe('off');
		a.unmount();
		b.unmount();
	});

	it('the folded branch is interactive and updates like the oracle', () => {
		const a = mount(RetToggle as any, { on: true });
		a.click('button');
		expect(a.find('button').textContent).toBe('on:1');
		a.unmount();

		// Same observable update as the inline oracle (mounted separately to avoid
		// the duplicate-id quirk).
		const b = mount(AtToggle as any, { on: true });
		b.click('button');
		expect(b.find('button').textContent).toBe('on:1');
		b.unmount();
	});
});

// The fold's hydration proof: the folded return-JSX form must SSR byte-identically
// to the inline `@{}` form (so the server markup is the same) AND the client must
// adopt that markup (not rebuild) — the extra markerless `__ret`/`_frag` layer must
// not desync the hydration cursor.
describe('folded @if hydrates against the @{} oracle markup', () => {
	it('SSR of the folded form byte-equals the inline form', async () => {
		const server = serverModule();
		const ret = await ServerRT.renderToString(server.RetToggle, { on: true });
		const at = await ServerRT.renderToString(server.AtToggle, { on: true });
		expect(ret.html).toBe(at.html);
		expect(ret.html).toContain('on:0');
	});

	it('adopts the server-rendered branch and stays interactive', async () => {
		const server = serverModule();
		const { html } = await ServerRT.renderToString(server.RetToggle, { on: true });
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const btn = container.querySelector('button') as HTMLButtonElement;
		const root = hydrateRoot(container, RetToggle, { on: true });
		flushSync(() => {});
		expect(container.querySelector('button')).toBe(btn); // adopted, not rebuilt
		flushSync(() => btn.click());
		expect(btn.textContent).toBe('on:1'); // handler is live on the adopted node
		root.unmount();
		container.remove();
	});
});

// Stage 0 of the fold: a plain single-root return-JSX component (no control flow)
// folds to the return-based fragment model. Same contract as above — the inline
// `@{}` form is the oracle for the produced DOM, and updates PATCH the mounted
// nodes in place (non-VDOM: the same button/text nodes survive re-renders).
describe('folded return-JSX single root matches the inline @{} oracle', () => {
	it('byte-equal DOM on mount (markerless single-root)', () => {
		const a = mount(RetCount as any);
		const b = mount(AtBraceCount as any);
		expect(a.container.innerHTML).toBe(b.container.innerHTML);
		expect(a.container.innerHTML).toBe('<button>0</button>');
		a.unmount();
		b.unmount();
	});

	it('reconciles in place: same button node patched 0->1->2 (non-VDOM)', () => {
		const r = mount(RetCount as any);
		const btn = r.container.querySelector('button')!;
		expect(btn.textContent).toBe('0');
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(btn.textContent).toBe('1');
		expect(r.container.querySelector('button')).toBe(btn); // SAME node — patched
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(btn.textContent).toBe('2');
		expect(r.container.querySelector('button')).toBe(btn);
		r.unmount();
	});
});
