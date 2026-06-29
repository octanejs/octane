import { describe, it, expect } from 'vitest';
import { mount, act, createLog } from '../_helpers';
import { CrossDepth, ParentChild, MultiEffect } from './_fixtures/effect-order.tsrx';

// React commits effects in a POST-ORDER tree walk: a node's descendants fire before it,
// and disjoint subtrees fire in tree order. A plain deepest-first sort gets the
// parent/child relationship right but mis-orders a shallow node in an EARLIER sibling
// subtree against a DEEPER node in a LATER one. These pin octane to React's order.
describe('conformance: layout-effect commit order (post-order)', () => {
	it('fires sibling subtrees in tree order even when the later one is deeper', async () => {
		const log = createLog();
		mount(CrossDepth as any, { log });
		await act(() => {});
		// shallow (depth 1, first subtree) BEFORE deep (depth 2, second subtree).
		expect(log.drain()).toEqual(['shallow', 'deep']);
	});

	it('fires child layout effects before the parent (child-first)', async () => {
		const log = createLog();
		mount(ParentChild as any, { log });
		await act(() => {});
		expect(log.drain()).toEqual(['child', 'parent']);
	});

	it('fires multiple effects in one component in registration order', async () => {
		const log = createLog();
		mount(MultiEffect as any, { log });
		await act(() => {});
		expect(log.drain()).toEqual(['first', 'second']);
	});
});

import { CrossDepthRefs } from './_fixtures/effect-order.tsrx';

describe('conformance: ref-attach commit order (post-order)', () => {
	it('attaches refs in tree order even when the later subtree is deeper', async () => {
		const log = createLog();
		mount(CrossDepthRefs as any, { log });
		await act(() => {});
		// shallowRef (depth 1, first subtree) BEFORE deepRef (depth 2, second subtree).
		expect(log.drain()).toEqual(['shallowRef', 'deepRef']);
	});
});
