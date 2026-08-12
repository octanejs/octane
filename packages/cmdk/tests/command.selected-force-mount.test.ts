import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { settle } from './_command-helpers';
import { RemovableMenu } from './_fixtures/basic.tsrx';

describe('@octanejs/cmdk — selected forceMount teardown divergence', () => {
	// @parity-case octane:selected-force-mount-teardown
	it('moves the selection on when the selected forceMount item is removed', async () => {
		const app = mount(RemovableMenu, { show: true, kind: 'force' });
		await settle();
		expect(app.find('[cmdk-item][aria-selected="true"]').textContent).toBe('Apple');

		app.update(RemovableMenu, { show: false, kind: 'force' });
		await settle();

		const selected = app.find('[cmdk-item][aria-selected="true"]');
		expect(selected?.textContent).toBe('Banana');
		expect(app.find('[cmdk-input]').getAttribute('aria-activedescendant')).toBe(
			selected!.getAttribute('id'),
		);

		app.unmount();
	});
});
