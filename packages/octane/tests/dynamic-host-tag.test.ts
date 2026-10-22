// A dynamic tag that resolves to a host string renders that element, in a
// module graph where nothing else builds an element descriptor.
import { describe, expect, it } from 'vitest';
import { mount } from './_helpers.js';
import { DynamicTag } from './_fixtures/dynamic-host-tag.tsrx';

describe('dynamic host tags', () => {
	it('renders and updates the host element a dynamic tag names', () => {
		const view = mount(DynamicTag, { tag: 'section', label: 'first' });
		try {
			const section = view.container.querySelector('section.dynamic')!;
			expect(section).not.toBeNull();
			expect(section.textContent).toBe('first');
			view.update(DynamicTag, { tag: 'section', label: 'second' });
			expect(view.container.querySelector('section.dynamic')).toBe(section);
			expect(section.textContent).toBe('second');
			view.update(DynamicTag, { tag: 'aside', label: 'third' });
			expect(view.container.querySelector('section')).toBeNull();
			expect(view.container.querySelector('aside.dynamic')!.textContent).toBe('third');
		} finally {
			view.unmount();
		}
	});
});
