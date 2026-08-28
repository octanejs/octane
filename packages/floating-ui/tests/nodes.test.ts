import { describe, expect, it } from 'vitest';
import type { FloatingNodeType } from '../src/types';
import { getDeepestNode } from '../src/utils/nodes';

type TestNode = FloatingNodeType & { id: string };

function node(id: string, parentId: string | null, open = true): TestNode {
	return {
		id,
		parentId,
		context: { open } as FloatingNodeType['context'],
	};
}

describe('@octanejs/floating-ui — floating tree nodes', () => {
	it('returns the root when it has no open descendants', () => {
		const root = node('root', null);
		expect(getDeepestNode([root], root.id)).toBe(root);
	});

	it('ignores descendants behind a closed branch', () => {
		const root = node('root', null);
		const closed = node('closed', root.id, false);
		const hidden = node('hidden', closed.id);
		const visible = node('visible', root.id);
		expect(getDeepestNode([root, closed, hidden, visible], root.id)).toBe(visible);
	});

	it('keeps the first tree-order node when branches tie for depth', () => {
		const root = node('root', null);
		const first = node('first', root.id);
		const second = node('second', root.id);
		const secondLeaf = node('second-leaf', second.id);
		const firstLeaf = node('first-leaf', first.id);
		expect(getDeepestNode([root, first, second, secondLeaf, firstLeaf], root.id)).toBe(firstLeaf);
	});

	it('can start from a parent id whose node is not registered', () => {
		const child = node('child', 'missing');
		const leaf = node('leaf', child.id);
		expect(getDeepestNode([child, leaf], 'missing')).toBe(leaf);
	});
});
