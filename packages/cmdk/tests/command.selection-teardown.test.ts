import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { settle } from './_command-helpers';
import { AsyncItemsNoValueMenu } from './_fixtures/basic.tsrx';

describe('@octanejs/cmdk — multi-item teardown reselect divergence', () => {
	it('moves the selection on when the selected item is removed alongside a sibling', async () => {
		// Every item teardown scheduled its follow-up under the SAME batcher key, and
		// the batcher is a Map — so removing two items in one update let the second
		// teardown overwrite the first, and the callback that survived had captured a
		// different item. The selection was left pointing at a node that no longer
		// exists: nothing renders `aria-selected`, the combobox's
		// `aria-activedescendant` dangles at a removed id, and Enter does nothing.
		const app = mount(AsyncItemsNoValueMenu, { items: ['Apple', 'Banana', 'Cherry'] });
		await settle();
		expect(app.find('[cmdk-item][aria-selected="true"]').textContent).toBe('Apple');

		// Drop the selected item together with a sibling.
		app.update(AsyncItemsNoValueMenu, { items: ['Cherry'] });
		await settle();

		const selected = app.find('[cmdk-item][aria-selected="true"]');
		expect(selected?.textContent).toBe('Cherry');

		// ...and the combobox must not be left pointing at a node that has been
		// removed from the document — the accessibility half of the same bug.
		const active = app.find('[cmdk-input]').getAttribute('aria-activedescendant');
		expect(active).toBe(selected!.getAttribute('id'));

		app.unmount();
	});
});
