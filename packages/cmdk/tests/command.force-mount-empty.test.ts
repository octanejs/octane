import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { settle, typeInput } from './_command-helpers';
import { BasicMenu, ForceMountMenu } from './_fixtures/basic.tsrx';

describe('@octanejs/cmdk — force-mount Empty divergence', () => {
	// @parity-case octane:force-mount-empty-visible
	it('does not announce "no results" while a forceMount item is visible', async () => {
		// A force-mounted item is exempt from filtering, so it never enters
		// `filtered.count` — but it is on screen, and Empty and a visible item are
		// mutually exclusive.
		const app = mount(ForceMountMenu);
		await settle();

		const input = app.find('[cmdk-input]') as HTMLInputElement;
		typeInput(input, 'zzzzzz');
		await settle();

		const items = app.findAll('[cmdk-item]');
		expect(items.map((el) => el.textContent)).toEqual(['Always Here']);
		expect(app.container.querySelector('[cmdk-empty]')).toBeNull();

		app.unmount();
	});

	// @parity-case octane:force-mount-empty-release
	it('shows Empty again once the last forceMount item unmounts', async () => {
		// The force-mount count has to be released on unmount, or Empty is
		// suppressed forever after a force-mounted item goes away.
		const app = mount(ForceMountMenu);
		await settle();
		const input = app.find('[cmdk-input]') as HTMLInputElement;
		typeInput(input, 'zzzzzz');
		await settle();
		expect(app.container.querySelector('[cmdk-empty]')).toBeNull();

		// Swap to a menu with no force-mounted items; nothing matches, so Empty returns.
		app.update(BasicMenu);
		await settle();
		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'zzzzzz');
		await settle();
		expect(app.container.querySelector('[cmdk-empty]')).toBeTruthy();

		app.unmount();
	});
});
