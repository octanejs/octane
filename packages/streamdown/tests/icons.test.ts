import { describe, expect, it } from 'vitest';
import { createElement } from 'octane';
import type { IconComponent } from '../src/lib/icon-context.tsrx';
import { defaultIcons } from '../src/lib/icon-context.tsrx';
import { mount } from '../../octane/tests/_helpers';

function IconHarness({ Icon, size }: { Icon: IconComponent; size: number }) {
	return createElement(Icon, { size });
}

describe('@octanejs/streamdown built-in icons', () => {
	it.each(Object.entries(defaultIcons))('%s applies the requested size', (_name, Icon) => {
		const mounted = mount(IconHarness, { Icon, size: 20 });

		try {
			const svg = mounted.find('svg');
			expect(svg.getAttribute('width')).toBe('20');
			expect(svg.getAttribute('height')).toBe('20');
			expect(svg.hasAttribute('size')).toBe(false);
		} finally {
			mounted.unmount();
		}
	});
});
