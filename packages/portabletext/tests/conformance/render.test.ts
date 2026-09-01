import { describe, expect, it } from 'vitest';
import { mount } from '../../../octane/tests/_helpers.js';
import { toPlainText } from '@octanejs/portabletext';
import {
	CustomPortableTextFixture,
	DefaultPortableTextFixture,
	portableTextValue,
} from '../_fixtures/render.tsrx';

describe('@octanejs/portabletext — rendering', () => {
	it('renders default blocks, marks, hard breaks, and lists', () => {
		const mounted = mount(DefaultPortableTextFixture, {});
		expect(mounted.find('h2').textContent).toBe('Portable Text');
		expect(mounted.find('strong').textContent).toBe('structured');
		expect(mounted.find('a').getAttribute('href')).toBe('https://portabletext.org');
		expect(mounted.findAll('br')).toHaveLength(1);
		expect(mounted.findAll('ul > li')).toHaveLength(2);
		expect(mounted.find('#default-portable-text > div').style.display).toBe('none');
		mounted.unmount();
	});

	it('applies custom type and block renderers and can preserve hard breaks as text', () => {
		const mounted = mount(CustomPortableTextFixture, {});
		expect(mounted.find('.portable-paragraph').textContent).toContain('Render structured content');
		expect(mounted.findAll('br')).toHaveLength(0);
		expect(mounted.find('aside').textContent).toBe('Framework-neutral data');
		expect(mounted.find('aside').getAttribute('data-inline')).toBe('false');
		mounted.unmount();
	});

	it('re-exports the framework-neutral plain-text serializer', () => {
		expect(toPlainText(portableTextValue as never)).toContain('Portable Text');
	});
});
