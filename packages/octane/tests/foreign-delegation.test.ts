import { afterEach, describe, expect, it } from 'vitest';
import { mount } from './_helpers';
import { App } from './_fixtures/foreign-delegation.tsrx';

// Regression (#1882): Solid's event delegation stamps handlers at `node.$$click`
// and calls them from a `document` listener. Octane's delegated slots must live
// in their own namespace, or a Solid widget mounted inside an Octane root (such
// as the TanStack Query devtools) has every click handler run twice: once by
// Solid and once by Octane, in both directions.

// The shape of solid-js/web's delegated `eventHandler`: walk from the target to
// the document and call any function found at `node['$$' + type]`.
function solidLikeDelegation(type: string): () => void {
	const key = '$$' + type;
	const handler = (event: Event) => {
		let node = event.target as (Node & Record<string, unknown>) | null;
		while (node !== null) {
			const fn = node[key];
			if (typeof fn === 'function') fn.call(node, event);
			node = node.parentNode as (Node & Record<string, unknown>) | null;
		}
	};
	document.addEventListener(type, handler);
	return () => document.removeEventListener(type, handler);
}

let cleanup: (() => void)[] = [];
afterEach(() => {
	for (const fn of cleanup) fn();
	cleanup = [];
});

describe('delegated events beside a foreign `$$<type>` delegation', () => {
	it('never runs a foreign `$$click` stamp inside an Octane root', () => {
		const log: string[] = [];
		const r = mount(App as any, { log: (m: string) => log.push(m) });
		const foreign = document.createElement('span');
		let foreignCalls = 0;
		(foreign as any).$$click = () => foreignCalls++;
		r.container.querySelector('.foreign-host')!.appendChild(foreign);
		foreign.click();
		expect(foreignCalls).toBe(0);
		expect(log).toEqual(['octane-capture']);
		r.unmount();
	});

	it('runs each handler once when a Solid-like delegation shares the document', () => {
		cleanup.push(solidLikeDelegation('click'));
		const log: string[] = [];
		const r = mount(App as any, { log: (m: string) => log.push(m) });

		r.click('.octane');
		expect(log).toEqual(['octane-capture', 'octane-bubble']);

		log.length = 0;
		const foreign = document.createElement('span');
		let foreignCalls = 0;
		(foreign as any).$$click = () => foreignCalls++;
		r.container.querySelector('.foreign-host')!.appendChild(foreign);
		foreign.click();
		expect(foreignCalls).toBe(1);
		expect(log).toEqual(['octane-capture']);
		r.unmount();
	});
});
