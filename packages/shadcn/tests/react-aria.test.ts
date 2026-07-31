import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { AriaButtonApp } from './_fixtures/react-aria-app.tsrx';

// The React Aria base renders through @octanejs/aria/components primitives
// (RAC Button / Link) while keeping the Radix base's visual contract. These
// assertions are the consumer-visible half of that: the slot name, the variant
// attributes upstream's aria base sets, and the host element each primitive
// resolves to.
describe('@octanejs/shadcn/react-aria — Button', () => {
	it('renders a button host carrying the shared slot and variant attributes', () => {
		const r = mount(AriaButtonApp);
		const plain = r.find('#plain') as HTMLElement;
		expect(plain.tagName).toBe('BUTTON');
		expect(plain.getAttribute('data-slot')).toBe('button');
		expect(plain.getAttribute('data-variant')).toBe('default');
		expect(plain.getAttribute('data-size')).toBe('default');
		expect(plain.textContent).toBe('Save');
		r.unmount();
	});

	it('applies the variant and size the caller asked for', () => {
		const r = mount(AriaButtonApp);
		const danger = r.find('#danger') as HTMLElement;
		expect(danger.getAttribute('data-variant')).toBe('destructive');
		expect(danger.getAttribute('data-size')).toBe('sm');
		// The destructive variant's classes come from the shared cva map.
		expect(danger.className).toContain('text-destructive');
		expect(danger.className).toContain('h-7');
		r.unmount();
	});

	it('renders LinkButton as an anchor, which the Radix base has no equivalent for', () => {
		const r = mount(AriaButtonApp);
		const link = r.find('#link') as HTMLElement;
		expect(link.tagName).toBe('A');
		expect(link.getAttribute('href')).toBe('/next');
		expect(link.getAttribute('data-slot')).toBe('button');
		r.unmount();
	});
});
