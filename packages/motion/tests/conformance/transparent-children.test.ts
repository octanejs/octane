import { describe, expect, it } from 'vitest';
import { mount } from '../_helpers';
import { AnimatePresenceChildrenDialectFlip } from '../_fixtures/transparent-children-dialect.tsrx';
import { TsxMotionConfig, TsxPresence } from '../_fixtures/transparent-children';

describe('transparent Motion components', () => {
	it('renders and updates descriptor children authored in TSX', () => {
		const rendered = mount(TsxPresence, { show: false });
		expect(rendered.container.querySelector('#presence-child')).toBeNull();

		rendered.update(TsxPresence, { show: true });
		expect(rendered.container.querySelector('#presence-child')?.textContent).toBe('visible');

		rendered.update(TsxPresence, { show: false });
		expect(rendered.container.querySelector('#presence-child')).toBeNull();
		rendered.unmount();
	});

	it('renders MotionConfig descriptor children authored in TSX', () => {
		const rendered = mount(TsxMotionConfig, {});
		expect(rendered.container.querySelector('#config-child')?.textContent).toBe('configured');
		rendered.unmount();
	});

	it('remounts children when their authoring dialect changes', () => {
		const rendered = mount(AnimatePresenceChildrenDialectFlip, {});
		expect(rendered.container.querySelector('.count')?.textContent).toBe('count:0');

		rendered.click('.count');
		expect(rendered.container.querySelector('.count')?.textContent).toBe('count:1');

		rendered.click('.toggle');
		expect(rendered.container.querySelector('.count')?.textContent).toBe('count:0');

		rendered.click('.toggle');
		expect(rendered.container.querySelector('.count')?.textContent).toBe('count:0');
		rendered.unmount();
	});
});
