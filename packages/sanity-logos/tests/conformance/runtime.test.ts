import { describe, expect, it } from 'vitest';
import { mount } from '../../../octane/tests/_helpers.js';
import { SanityLogoGallery } from '../_fixtures/logos.tsrx';

describe('@octanejs/sanity-logos — runtime', () => {
	it('renders all marks, variants, custom colors, and refs', () => {
		const refs: (SVGSVGElement | null)[] = [];
		const mounted = mount(SanityLogoGallery, { onLogoRef: (node) => refs.push(node) });
		expect(mounted.findAll('svg')).toHaveLength(8);
		expect(mounted.find('#sanity-default path').getAttribute('fill')).toBe('#0D0E12');
		expect(mounted.find('#sanity-dark path').getAttribute('fill')).toBe('#ffffff');
		expect(mounted.find('#monogram-custom rect').getAttribute('fill')).toBe('#123456');
		expect(mounted.find('#monogram-custom path').getAttribute('fill')).toBe('#abcdef');
		expect(refs).toEqual([mounted.find('#sanity-default')]);
		mounted.unmount();
		expect(refs.at(-1)).toBe(null);
	});
});
