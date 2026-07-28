import { describe, expect, it } from 'vitest';
import { mount } from '../_helpers';
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
});
