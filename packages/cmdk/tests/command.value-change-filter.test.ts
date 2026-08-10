import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { settle, typeInput } from './_command-helpers';
import { DynamicValueMenu } from './_fixtures/basic.tsrx';

describe('@octanejs/cmdk — value-change filter refresh divergence', () => {
	it('refreshes the match count when an item value changes during a search', async () => {
		// Empty and a result are mutually exclusive: whenever an item is visible,
		// "no results" must not be. Re-registering an item's value re-scores that
		// item, so the aggregate count/groups have to be recomputed with it — a
		// score-only update leaves the count stale and renders both at once.
		const app = mount(DynamicValueMenu, { itemValue: 'apple' });
		await settle();

		const input = app.find('[cmdk-input]') as HTMLInputElement;
		typeInput(input, 'zzz');
		await settle();

		// Nothing matches "zzz": the empty state is the only thing showing.
		expect(app.findAll('[cmdk-item]')).toHaveLength(0);
		expect(app.find('[cmdk-empty]')).toBeTruthy();

		// The item's value now matches the active search.
		app.update(DynamicValueMenu, { itemValue: 'zzz' });
		await settle();

		expect(app.findAll('[cmdk-item]')).toHaveLength(1);
		expect(app.container.querySelector('[cmdk-empty]')).toBeNull();
		// The group holding the newly-matching item is visible too.
		expect(app.find('[cmdk-group]').hasAttribute('hidden')).toBe(false);

		app.unmount();
	});
});
