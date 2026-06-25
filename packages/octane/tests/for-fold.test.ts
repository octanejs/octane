import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { hydrateRoot, flushSync } from '../src/index.js';
import { RetList, AtList, RetListApp } from './_fixtures/for-fold.tsrx';

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/for-fold.tsrx');
function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'for-fold.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		'const {$1} = __rt;',
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, 'const $1 = __exports.$1 = function $1');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}

const ITEMS = [
	{ id: 1, title: 'a' },
	{ id: 2, title: 'b' },
];

describe('folded @for (return-JSX) matches the inline @{} oracle', () => {
	it('byte-equal DOM with items', () => {
		const a = mount(RetList as any, { items: ITEMS });
		const b = mount(AtList as any, { items: ITEMS });
		expect(a.html()).toBe(b.html());
		expect(a.findAll('li').map((li) => li.textContent)).toEqual(['a', 'b']);
		a.unmount();
		b.unmount();
	});

	it('byte-equal DOM on the @empty branch', () => {
		const a = mount(RetList as any, { items: [] });
		const b = mount(AtList as any, { items: [] });
		expect(a.html()).toBe(b.html());
		expect(a.find('.empty').textContent).toBe('none');
		a.unmount();
		b.unmount();
	});

	it('keyed reconcile through the fold matches the oracle on re-render', () => {
		const a = mount(RetList as any, { items: ITEMS });
		const b = mount(AtList as any, { items: ITEMS });
		const reordered = [
			{ id: 2, title: 'b' },
			{ id: 1, title: 'a' },
			{ id: 3, title: 'c' },
		];
		a.update(RetList as any, { items: reordered });
		b.update(AtList as any, { items: reordered });
		expect(a.html()).toBe(b.html());
		expect(a.findAll('li').map((li) => li.textContent)).toEqual(['b', 'a', 'c']);
		a.unmount();
		b.unmount();
	});

	it('stateful add is interactive (keyed list grows)', () => {
		const r = mount(RetListApp as any);
		expect(r.findAll('li').map((li) => li.textContent)).toEqual(['a']);
		r.click('button');
		expect(r.findAll('li').map((li) => li.textContent)).toEqual(['a', 'x']);
		r.unmount();
	});
});

describe('folded @for hydrates against the @{} oracle markup', () => {
	it('SSR byte-equals the inline form and adopts on hydrate', async () => {
		const server = serverModule();
		const ret = await ServerRT.render(server.RetList, { items: ITEMS });
		const at = await ServerRT.render(server.AtList, { items: ITEMS });
		expect(ret.body).toBe(at.body);

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = ret.body;
		const firstLi = container.querySelector('li') as HTMLElement;
		const root = hydrateRoot(container, RetList, { items: ITEMS });
		flushSync(() => {});
		expect(container.querySelector('li')).toBe(firstLi); // adopted, not rebuilt
		expect(Array.from(container.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
			'a',
			'b',
		]);
		root.unmount();
		container.remove();
	});
});
