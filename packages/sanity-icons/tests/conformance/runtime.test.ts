import { describe, expect, it } from 'vitest';
import { mount } from '../../../octane/tests/_helpers.js';
import { icons } from '@octanejs/sanity-icons';
import { icons as upstreamIcons } from '@sanity/icons';
import { SanityIconGallery } from '../_fixtures/icons.tsrx';

describe('@octanejs/sanity-icons — runtime', () => {
	it('forwards SVG props, refs, and native events', () => {
		const refs: (SVGSVGElement | null)[] = [];
		const clicks: MouseEvent[] = [];
		const mounted = mount(SanityIconGallery, {
			onRocketClick: (event) => clicks.push(event),
			onRocketRef: (node) => refs.push(node),
		});
		const rocket = mounted.find('#rocket');
		expect(rocket.getAttribute('data-sanity-icon')).toBe('rocket');
		expect(rocket.getAttribute('class')).toBe('launch-icon');
		expect(rocket.getAttribute('color')).toBe('rebeccapurple');
		expect(refs).toEqual([rocket]);
		mounted.click('#rocket');
		expect(clicks[0]).toBeInstanceOf(MouseEvent);
		expect(mounted.find('#color-wheel').querySelectorAll('path').length).toBeGreaterThan(0);
		mounted.unmount();
		expect(refs.at(-1)).toBe(null);
	});

	it('matches the complete upstream lazy icon symbol map', () => {
		expect(Object.keys(icons).sort()).toEqual(Object.keys(upstreamIcons).sort());
		expect(Object.keys(icons)).toHaveLength(236);
	});
});
