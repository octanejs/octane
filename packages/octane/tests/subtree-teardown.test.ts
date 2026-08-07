import { describe, expect, it } from 'vitest';
import { flushSync } from '../src/index.js';
import { mount, flushEffects } from './_helpers.js';
import { TeardownApp, hideSubtree } from './_fixtures/subtree-teardown.tsrx';

// Removing a subtree removes ALL of it. The enclosing block's range removal is
// what takes the nodes inside it, so the pieces that live somewhere else (a
// portal's foreign target) have to be taken by their own teardown, and every
// component in the subtree still has to get its cleanup.
describe('subtree teardown', () => {
	function setup() {
		const target = document.createElement('div');
		target.id = 'portal-target';
		document.body.appendChild(target);
		const log: string[] = [];
		const result = mount(TeardownApp, { target, log });
		flushEffects();
		return { target, log, result };
	}

	it('removes every node of a deep subtree, including a portal in a foreign target', () => {
		const { target, log, result } = setup();
		expect(result.findAll('.leaf')).toHaveLength(16);
		expect(result.findAll('.n')).toHaveLength(15);
		expect(target.querySelectorAll('.portaled')).toHaveLength(1);

		flushSync(hideSubtree);

		expect(result.findAll('.leaf')).toHaveLength(0);
		expect(result.findAll('.n')).toHaveLength(0);
		expect(result.findAll('.page')).toHaveLength(0);
		// The portal's content is outside the removed range, so nothing else can
		// have taken it.
		expect(target.querySelectorAll('.portaled')).toHaveLength(0);
		// The shell itself is untouched.
		expect(result.findAll('.shell')).toHaveLength(1);

		result.unmount();
		target.remove();
	});

	it('fires a cleanup for every component in the removed subtree, parent first', () => {
		const { target, log, result } = setup();
		log.length = 0;

		flushSync(hideSubtree);
		flushEffects();

		expect(log[0]).toBe('page');
		expect(log.filter((entry) => entry.startsWith('leaf:'))).toHaveLength(16);
		expect(new Set(log)).toHaveProperty('size', 17);

		result.unmount();
		target.remove();
	});

	it('leaves the container empty when the root is unmounted', () => {
		const { target, result } = setup();
		result.root.unmount();
		expect(result.container.querySelector('*')).toBe(null);
		expect(target.querySelectorAll('.portaled')).toHaveLength(0);
		result.container.remove();
		target.remove();
	});
});
