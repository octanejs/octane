import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import {
	KeyedReturnWrapper,
	KeyedWrapperList,
	ReturnedSuspenseChildSlot,
	SuspenseWrapperChain,
	SwappingBranch,
	WrapperChain,
} from './_fixtures/wrapper-adoption.tsrx';

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/wrapper-adoption.tsrx',
);

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'wrapper-adoption.tsrx', {
		mode: 'server',
	});
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export function (\w+)\(/g, '__exports.$1 = $1; function $1(');
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
}

const server = serverModule();

function renderServer(name: string, props: any): string {
	return ServerRT.renderToString(server[name], props).html;
}

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

describe('hydrateRoot — nested wrapper and boundary adoption', () => {
	it('adopts a stateful button through nested wrappers', () => {
		container.innerHTML = renderServer('WrapperChain', {});
		const section = container.querySelector('.wrapper-chain')!;
		const serverButton = section.querySelector('.wrapper-button') as HTMLButtonElement;

		const root = hydrateRoot(container, WrapperChain, {});
		expect(section.querySelector('.wrapper-button')).toBe(serverButton);

		flushSync(() => serverButton.click());
		expect(section.querySelector('.wrapper-button')).toBe(serverButton);
		expect(serverButton.textContent).toBe('wrapped:1');
		root.unmount();
	});

	it('preserves component state when a hydrated branch swaps away and back', () => {
		container.innerHTML = renderServer('SwappingBranch', { active: true });
		const section = container.querySelector('.swapping-branch')!;
		const serverButton = section.querySelector('.branch-button') as HTMLButtonElement;

		const root = hydrateRoot(container, SwappingBranch, { active: true });
		expect(section.querySelector('.branch-button')).toBe(serverButton);

		flushSync(() => serverButton.click());
		expect(serverButton.textContent).toBe('branch:1');
		flushSync(() => root.render(SwappingBranch, { active: false }));
		expect(section.querySelector('.branch-button')).toBeNull();
		expect(section.querySelector('.branch-off')?.textContent).toBe('off');
		expect(serverButton.isConnected).toBe(false);

		flushSync(() => root.render(SwappingBranch, { active: true }));
		const replacement = section.querySelector('.branch-button') as HTMLButtonElement;
		expect(replacement).not.toBe(serverButton);
		expect(replacement.textContent).toBe('branch:1');
		flushSync(() => replacement.click());
		expect(replacement.textContent).toBe('branch:2');
		root.unmount();
	});

	it('adopts a return-position keyed child when its key is undefined', () => {
		container.innerHTML = renderServer('KeyedReturnWrapper', { itemKey: undefined });
		const serverButton = container.querySelector('.keyed-return-button');

		const root = hydrateRoot(container, KeyedReturnWrapper, { itemKey: undefined });
		expect(container.querySelector('.keyed-return-button')).toBe(serverButton);
		root.unmount();
	});

	it('preserves keyed row identity and state through hydration and reorder', () => {
		const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
		container.innerHTML = renderServer('KeyedWrapperList', { rows });
		const list = container.querySelector('.coalesced-list')!;
		const serverRows = new Map(
			[...list.querySelectorAll<HTMLElement>('.coalesced-row')].map((row) => [row.dataset.id, row]),
		);

		const root = hydrateRoot(container, KeyedWrapperList, { rows });
		for (const row of rows) {
			expect(list.querySelector(`[data-id="${row.id}"]`)).toBe(serverRows.get(row.id));
		}

		const bButton = serverRows.get('b')!.querySelector('.row-button') as HTMLButtonElement;
		flushSync(() => bButton.click());
		expect(bButton.textContent).toBe('b:1');

		const reordered = [rows[2], rows[1], rows[0]];
		flushSync(() => root.render(KeyedWrapperList, { rows: reordered }));
		expect([...list.querySelectorAll('.coalesced-row')]).toEqual([
			serverRows.get('c'),
			serverRows.get('b'),
			serverRows.get('a'),
		]);
		expect(bButton.textContent).toBe('b:1');
		root.unmount();
	});

	it('adopts ready content nested inside Suspense and wrapper components', () => {
		container.innerHTML = renderServer('SuspenseWrapperChain', {});
		const section = container.querySelector('.suspense-wrapper-chain')!;
		const serverButton = section.querySelector('.suspense-button');

		const root = hydrateRoot(container, SuspenseWrapperChain, {});
		expect(section.querySelector('.suspense-button')).toBe(serverButton);
		expect(section.querySelector('.pending')).toBeNull();
		root.unmount();
	});

	it('adopts an interactive Suspense value returned by a component', () => {
		container.innerHTML = renderServer('ReturnedSuspenseChildSlot', {});
		const section = container.querySelector('.returned-suspense-child-slot')!;
		const serverButton = section.querySelector('.returned-suspense-button') as HTMLButtonElement;

		const root = hydrateRoot(container, ReturnedSuspenseChildSlot, {});
		expect(section.querySelector('.returned-suspense-button')).toBe(serverButton);
		expect(section.querySelector('.returned-pending')).toBeNull();

		flushSync(() => serverButton.click());
		expect(section.querySelector('.returned-suspense-button')).toBe(serverButton);
		expect(serverButton.textContent).toBe('returned:1');
		root.unmount();
	});
});
