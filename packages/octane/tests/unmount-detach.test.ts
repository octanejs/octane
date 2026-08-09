import { describe, it, expect } from 'vitest';
import { mount, createLog } from './_helpers';
import { Toggle, Routes, List } from './_fixtures/unmount-observe.tsrx';

// React parity: every deletion cleanup runs BEFORE any of the deleted subtree's
// DOM is removed (commitDeletionEffects detaches the host once, after the
// destroy walk). A layout cleanup must therefore be able to observe the whole
// deleted subtree still in the document — including a SIBLING component whose
// own cleanup already fired. The DOM must still be fully gone afterwards.

// What each Observed leaf reports at cleanup time: connectivity of both leaf
// spans and their shared host wrapper.
function observer(container: () => HTMLElement) {
	return () => {
		const c = container();
		const see = (sel: string) => {
			const el = c.querySelector(sel);
			return el !== null && el.isConnected;
		};
		return `first=${see('.obs.first')} second=${see('.obs.second')} pair=${see('.pair')}`;
	};
}

describe('deletion cleanups observe the whole deleted subtree still attached', () => {
	it('conditional-branch removal: both sibling cleanups see the full pair', () => {
		const log = createLog();
		let m!: ReturnType<typeof mount>;
		m = mount(Toggle as any, { show: true, log: log.push, observe: observer(() => m.container) });
		log.clear();

		m.update(Toggle as any, { show: false, log: log.push, observe: observer(() => m.container) });

		// The second sibling's cleanup fires after the first's — it must STILL see
		// the first sibling's DOM connected.
		expect(log.drain()).toEqual([
			'first cleanup sees first=true second=true pair=true',
			'second cleanup sees first=true second=true pair=true',
		]);
		// The deletion still completes: the branch's DOM is gone afterwards.
		expect(m.container.querySelector('.pair')).toBeNull();
		expect(m.container.querySelector('.obs')).toBeNull();
		expect(m.container.querySelector('.off')).not.toBeNull();
		m.unmount();
	});

	it('route-swap removal (@switch outlet): outgoing page cleanups see the full page', () => {
		const log = createLog();
		let m!: ReturnType<typeof mount>;
		m = mount(Routes as any, { route: 'a', log: log.push, observe: observer(() => m.container) });
		log.clear();

		m.update(Routes as any, { route: 'b', log: log.push, observe: observer(() => m.container) });

		expect(log.drain()).toEqual([
			'first cleanup sees first=true second=true pair=true',
			'second cleanup sees first=true second=true pair=true',
		]);
		expect(m.container.querySelector('.page-a')).toBeNull();
		expect(m.container.querySelector('.page-b')).not.toBeNull();
		m.unmount();
	});

	it('root.unmount(): both sibling cleanups see the full pair', () => {
		const log = createLog();
		let m!: ReturnType<typeof mount>;
		m = mount(Toggle as any, { show: true, log: log.push, observe: observer(() => m.container) });
		log.clear();

		m.root.unmount();

		expect(log.drain()).toEqual([
			'first cleanup sees first=true second=true pair=true',
			'second cleanup sees first=true second=true pair=true',
		]);
		expect(m.container.querySelector('*')).toBeNull();
		m.container.remove();
	});

	it('keyed item removal: the removed item cleanup sees its own item subtree', () => {
		const log = createLog();
		let m!: ReturnType<typeof mount>;
		const observe = () => {
			const el = m.container.querySelector('.item.b');
			return `item-b=${el !== null && el.isConnected}`;
		};
		m = mount(List as any, {
			items: [{ id: 'a' }, { id: 'b' }],
			log: log.push,
			observe,
		});
		log.clear();
		const survivor = m.container.querySelector('.item.a');

		m.update(List as any, { items: [{ id: 'a' }], log: log.push, observe });

		expect(log.drain()).toEqual(['b cleanup sees item-b=true']);
		expect(m.container.querySelector('.item.b')).toBeNull();
		// Survivor keeps identity.
		expect(m.container.querySelector('.item.a')).toBe(survivor);
		m.unmount();
	});
});
