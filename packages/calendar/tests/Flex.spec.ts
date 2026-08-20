import { cleanup, render } from '@octanejs/testing-library';
import { createElement } from 'octane';
import { afterEach, describe, expect, it } from 'vitest';

import Flex from '../src/Flex.tsrx';

afterEach(cleanup);

function element(text: string) {
	return createElement('div', {}, text);
}

describe('Flex', () => {
	// Per upstream/canonical/src/Flex.spec.tsx:7.
	it('styles itself properly with wrap flag set to false', () => {
		const { container } = render(Flex, {
			props: { children: [element('Hey'), element('Hi'), element('Hello')], count: 3, wrap: false },
		});
		const wrapper = container.firstElementChild as HTMLDivElement;

		expect(wrapper.style.display).toBe('flex');
		expect(wrapper.style.flexWrap).toBe('nowrap');
	});

	// Per upstream/canonical/src/Flex.spec.tsx:22.
	it('styles itself properly with wrap flag set to true', () => {
		const { container } = render(Flex, {
			props: { children: [element('Hey'), element('Hi'), element('Hello')], count: 3, wrap: true },
		});
		const wrapper = container.firstElementChild as HTMLDivElement;

		expect(wrapper.style.display).toBe('flex');
		expect(wrapper.style.flexWrap).toBe('wrap');
	});

	// Per upstream/canonical/src/Flex.spec.tsx:37.
	it('renders all given children', () => {
		const { container } = render(Flex, {
			props: { children: [element('Hey'), element('Hi'), element('Hello')], count: 3 },
		});
		const children = (container.firstElementChild as HTMLDivElement).children;

		expect(children).toHaveLength(3);
		expect(children[0]?.textContent).toBe('Hey');
		expect(children[1]?.textContent).toBe('Hi');
		expect(children[2]?.textContent).toBe('Hello');
	});

	// Per upstream/canonical/src/Flex.spec.tsx:55.
	it('properly sizes and positions all the elements', () => {
		const { container } = render(Flex, {
			props: { children: [element('Hey'), element('Hi')], count: 3, offset: 1 },
		});
		const children = Array.from((container.firstElementChild as HTMLDivElement).children);

		for (const child of children) {
			const element = child as HTMLElement;
			expect(element.style.flexBasis).toBe('33.333333333333336%');
			expect(element.style.flexShrink).toBe('0');
			expect(element.style.flexGrow).toBe('0');
			expect(element.style.overflow).toBe('hidden');
		}
	});

	// Octane-only guard for the descriptor-array adaptation required by Flex.
	it('ignores non-element children before cloning', () => {
		const { container } = render(Flex, {
			props: { children: ['ignored', element('kept')], count: 1 },
		});

		expect(container.firstElementChild?.children).toHaveLength(1);
		expect(container.firstElementChild?.textContent).toBe('kept');
	});
});
