import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import {
	AsChildDescriptorsFixture,
	IconResolutionFixture,
	NativeInputEventsFixture,
	nativeChangeEvents,
	nativeInputEvents,
} from './_fixtures/divergence-app.tsrx';

beforeEach(() => {
	nativeInputEvents.splice(0);
	nativeChangeEvents.splice(0);
});

describe('@octanejs/shadcn — documented runtime divergences', () => {
	// @parity-case adapted:shadcn-native-input-events
	it('all three bases expose native input and commit handlers with distinct timing', () => {
		const { container, unmount } = mount(NativeInputEventsFixture);
		const ids = [
			'radix-input',
			'radix-textarea',
			'aria-input',
			'aria-textarea',
			'base-input',
			'base-textarea',
		];
		for (const id of ids) {
			const control = container.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement;
			control.value = id;
			control.dispatchEvent(new Event('input', { bubbles: true }));
		}
		expect(nativeInputEvents).toEqual(ids);
		expect(nativeChangeEvents).toEqual([]);
		for (const control of container.querySelectorAll('input, textarea')) {
			control.dispatchEvent(new Event('change', { bubbles: true }));
		}
		expect(nativeChangeEvents).toEqual(ids);
		unmount();
	});

	// @parity-case adapted:shadcn-aschild-descriptors
	it('Button and Item compose descriptor children through asChild', () => {
		const { container, unmount } = mount(AsChildDescriptorsFixture);
		const button = container.querySelector('#as-button') as HTMLElement;
		expect(button.tagName).toBe('A');
		expect(button.getAttribute('data-slot')).toBe('button');
		expect(button.getAttribute('href')).toBe('#button');
		const item = container.querySelector('#as-item') as HTMLElement;
		expect(item.tagName).toBe('ARTICLE');
		expect(item.getAttribute('data-slot')).toBe('item');
		expect(item.textContent).toBe('Item');
		unmount();
	});

	// @parity-case adapted:shadcn-icon-resolution
	it('all marked icon placeholders resolve to the pinned Lucide shapes', () => {
		const { container, unmount } = mount(IconResolutionFixture);
		for (const id of ['radix-spinner', 'aria-spinner', 'base-spinner']) {
			const spinner = container.querySelector(`#${id}`) as SVGElement;
			expect(spinner.classList.contains('lucide-loader-circle')).toBe(true);
			expect(spinner.querySelectorAll('path').length).toBeGreaterThan(0);
		}
		const selectIcon = container.querySelector('[data-slot="native-select-icon"]') as SVGElement;
		expect(selectIcon.classList.contains('lucide-chevron-down')).toBe(true);
		expect(selectIcon.querySelectorAll('path').length).toBeGreaterThan(0);
		unmount();
	});
});
