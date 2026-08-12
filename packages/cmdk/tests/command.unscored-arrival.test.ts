import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { inVisualOrder, settle, typeInput } from './_command-helpers';
import { AsyncItemsNoValueMenu } from './_fixtures/basic.tsrx';

describe('@octanejs/cmdk — unscored arrival', () => {
	it('renders an item that arrives while a search is active, with no explicit value', async () => {
		// The real async-results flow: results land while the user is already
		// typing, and — as in every upstream example — the value is inferred from
		// the item's text rather than passed as a prop. A never-scored item used to
		// deadlock: it rendered null, so `ref.current` stayed null, so `useValue`
		// had no textContent to read, so it registered empty and scored zero
		// forever. It was invisible for as long as the search was non-empty.
		const app = mount(AsyncItemsNoValueMenu, { items: ['Apple'] });
		await settle();
		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'ap');
		await settle();
		expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual(['Apple']);

		app.update(AsyncItemsNoValueMenu, { items: ['Apple', 'Apricot'] });
		await settle();
		// Apple outranks Apricot for "ap", matching cmdk@1.1.1 on React.
		expect(inVisualOrder(app.findAll('[cmdk-item]')).map((el) => el.textContent)).toEqual([
			'Apple',
			'Apricot',
		]);

		app.unmount();
	});
});
