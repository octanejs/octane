import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import {
	AsChildBadge,
	DefaultBadge,
	OverridingBadge,
	SecondaryBadge,
} from './_fixtures/badge-app.tsrx';

describe('@octanejs/shadcn — Badge', () => {
	it('renders the upstream data-slot/data-variant/class contract', () => {
		const { container, unmount } = mount(DefaultBadge);
		const badge = container.querySelector('[data-slot="badge"]') as HTMLElement;
		expect(badge).not.toBeNull();
		expect(badge.tagName).toBe('SPAN');
		expect(badge.getAttribute('data-variant')).toBe('default');
		expect(badge.className).toContain('group/badge');
		expect(badge.className).toMatch(/(?:^| )bg-primary(?: |$)/);
		expect(badge.textContent).toBe('New');
		unmount();
	});

	it('applies the variant class and appends the consumer className', () => {
		const { container, unmount } = mount(SecondaryBadge);
		const badge = container.querySelector('[data-slot="badge"]') as HTMLElement;
		expect(badge.getAttribute('data-variant')).toBe('secondary');
		expect(badge.className).toContain('bg-secondary');
		expect(badge.className).not.toMatch(/(?:^| )bg-primary(?: |$)/);
		// Consumer classes land after the variant classes (cn() order).
		expect(badge.className.endsWith('custom-extra')).toBe(true);
		unmount();
	});

	it('tailwind-merges conflicting utilities and forwards host props (spread after contract attrs)', () => {
		const { container, unmount } = mount(OverridingBadge);
		const badge = container.querySelector('[data-slot="badge"]') as HTMLElement;
		// Base string carries overflow-hidden; the consumer's overflow-visible wins via twMerge.
		expect(badge.className).toContain('overflow-visible');
		expect(badge.className).not.toContain('overflow-hidden');
		expect(badge.id).toBe('host-props');
		expect(badge.title).toBe('badge');
		unmount();
	});

	it('asChild renders the child element as the host (radix Slot over descriptors)', () => {
		const { container, unmount } = mount(AsChildBadge);
		const badge = container.querySelector('[data-slot="badge"]') as HTMLElement;
		expect(badge.tagName).toBe('A');
		expect(badge.getAttribute('href')).toBe('#releases');
		expect(badge.getAttribute('data-variant')).toBe('outline');
		expect(badge.className).toContain('border-border');
		expect(badge.textContent).toBe('Releases');
		expect(container.querySelector('span[data-slot="badge"]')).toBeNull();
		unmount();
	});
});
