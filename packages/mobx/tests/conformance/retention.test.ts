import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { createElement, type ComponentBody } from 'octane';
import { observer } from '@octanejs/mobx';
import { mount } from '../_helpers';
import { RetainedTree, RetainedTreeBody, MemoRetainedTree } from '../_fixtures/retention.tsrx';

const gc: () => void = createRequire(import.meta.url)('expose-gc/function');

// Per mobx-react-lite 5.0.3 __tests__/useObserverRetention.test.tsx.
const DescriptorBody = (props: { label: string; capture: (tree: object) => void }) => {
	const tree = createElement('div', { 'data-label': props.label });
	props.capture(tree);
	return tree;
};

// Keep strong references out of the suspended async test's stack.
function prepare(Component: ComponentBody<{ label: string; capture: (tree: object) => void }>) {
	let firstTree: object | null = null;
	const capture = (tree: object) => {
		firstTree ??= tree;
	};
	const mounted = mount(Component, { label: 'first', capture });
	const weakFirstTree = new WeakRef(firstTree!);
	firstTree = null;
	for (const label of ['second', 'third', 'fourth']) {
		mounted.update(Component, { label, capture });
	}
	return { mounted, weakFirstTree };
}

it.each([
	['observed template', RetainedTree],
	['plain template', RetainedTreeBody],
	['memo template', MemoRetainedTree],
	['observed descriptor', observer(DescriptorBody)],
	['plain descriptor', DescriptorBody],
] as const)(
	'a mounted %s releases the element tree from its first render',
	async (_name, Component) => {
		const { mounted, weakFirstTree } = prepare(Component);
		try {
			expect(mounted.find('[data-label]').getAttribute('data-label')).toBe('fourth');
			await new Promise((resolve) => setTimeout(resolve, 1));
			gc();
			await new Promise((resolve) => setTimeout(resolve, 1));
			expect(weakFirstTree.deref()).toBeUndefined();
		} finally {
			mounted.unmount();
		}
	},
);
