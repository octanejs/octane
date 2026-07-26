import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from './_helpers';
import { NestedRefs, RefRows } from './_fixtures/scope-lazy-collections.tsrx';

// A Scope allocates its `cleanups` and `children` arrays only when something actually registers
// one. These pin the teardown behavior that laziness must not change: a scope that registered a
// cleanup still runs it, a scope that registered none still tears down, and the de-opt list clear
// still detaches refs on rows whose scopes hold no teardown state of their own.
describe('scope collections are lazily allocated', () => {
	it('detaches refs through nested scopes when a subtree unmounts', () => {
		const detached: number[] = [];
		let attached = 0;
		const collect = (el: Element | null) => {
			if (el) attached += 1;
			else detached.push(attached);
		};

		const m = mount(NestedRefs, { collect });
		flushEffects();
		expect(attached).toBe(2);

		m.click('.toggle');
		flushEffects();

		// Reaching both leaves means the teardown walked each level's lazily-allocated child
		// scopes and then each leaf's lazily-allocated cleanup array.
		expect(m.container.querySelectorAll('.leaf')).toHaveLength(0);
		expect(detached).toHaveLength(2);

		m.unmount();
	});

	it('detaches refs on keyed rows when the list is cleared', () => {
		const attached: Element[] = [];
		const detached: Element[] = [];
		const collect = (el: Element | null) => {
			if (el) attached.push(el);
			else detached.push(el as any);
		};

		const m = mount(RefRows, { collect });
		flushEffects();
		expect(attached).toHaveLength(3);

		m.click('.clear');
		flushEffects();

		expect(m.container.querySelectorAll('.row')).toHaveLength(0);
		expect(detached).toHaveLength(3);

		m.unmount();
	});
});
