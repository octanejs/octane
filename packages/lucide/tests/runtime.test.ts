import { describe, expect, it, vi } from 'vitest';
import { mount } from '../../octane/tests/_helpers.js';
import { createLucideIcon } from '@octanejs/lucide';
import { IconGallery } from './_fixtures/icons.tsrx';

describe('@octanejs/lucide — runtime behavior', () => {
	it('applies SVG defaults, provider values, accessibility, refs, and native events', () => {
		const refs: (SVGSVGElement | null)[] = [];
		const clicks: MouseEvent[] = [];
		const mounted = mount(IconGallery, {
			onCameraRef: (node) => refs.push(node),
			onCameraClick: (event) => clicks.push(event),
		});

		const camera = mounted.find('#camera');
		expect(camera.getAttribute('width')).toBe('32');
		expect(camera.getAttribute('height')).toBe('32');
		expect(camera.getAttribute('stroke')).toBe('rebeccapurple');
		expect(camera.getAttribute('stroke-width')).toBe('1.5');
		expect(camera.getAttribute('class')).toBe('lucide lucide-camera toolbar-icon');
		expect(camera.getAttribute('aria-hidden')).toBe('true');
		expect(refs).toEqual([camera]);

		const search = mounted.find('#search');
		expect(search.getAttribute('width')).toBe('18');
		expect(search.getAttribute('stroke')).toBe('tomato');
		expect(search.getAttribute('stroke-width')).toBe('4');
		expect(search.getAttribute('class')).toBe('lucide provided lucide-search local');
		expect(search.hasAttribute('aria-hidden')).toBe(false);

		expect(mounted.find('#alert title').textContent).toBe('Warning');
		expect(mounted.findAll('#custom > *')).toHaveLength(2);

		mounted.click('#camera');
		expect(clicks).toHaveLength(1);
		expect(clicks[0]).toBeInstanceOf(MouseEvent);

		mounted.unmount();
		expect(refs.at(-1)).toBe(null);
	});

	it('does not add duplicate class tokens', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const mounted = mount(IconGallery, {});
		const tokens = mounted.find('#camera').getAttribute('class')!.split(' ');
		expect(new Set(tokens).size).toBe(tokens.length);
		mounted.unmount();
		warn.mockRestore();
	});

	it('normalizes custom icon names like lucide-react', () => {
		const CustomIcon = createLucideIcon('my_icon', []);
		expect(CustomIcon.displayName).toBe('MyIcon');
		const mounted = mount(CustomIcon, { id: 'custom-name' });
		expect(mounted.find('#custom-name').getAttribute('class')).toBe(
			'lucide lucide-my-icon lucide-my_icon',
		);
		mounted.unmount();
	});
});
