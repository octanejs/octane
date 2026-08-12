import { describe, expect, it, vi } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { consoleErrorCalls } from './_setup';
import { settle } from './_command-helpers';
import { ForceMountSwapMenu, GroupSwapMenu, RemovableMenu } from './_fixtures/basic.tsrx';

describe('@octanejs/cmdk — registration teardown', () => {
	it.each(['item', 'force', 'group'] as const)(
		'removing a rendered %s from outside the menu reports nothing',
		async (kind) => {
			// Octane runs a removed child's effect cleanups during the PARENT's
			// render, so registration teardown that schedules work synchronously
			// updates Command while another component is rendering — which the
			// runtime reports and this suite treats as a failure. Every registration
			// path (item, force-mounted item, group) has to stay quiet, and the menu
			// has to keep working afterwards.
			const app = mount(RemovableMenu, { show: true, kind });
			await settle();
			expect(app.findAll('[cmdk-item]')).toHaveLength(2);

			app.update(RemovableMenu, { show: false, kind });
			await settle();

			expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual(['Banana']);
			expect(app.find('[cmdk-item][aria-selected="true"]').textContent).toBe('Banana');
			expect(consoleErrorCalls()).toEqual([]);

			app.unmount();
		},
	);

	// @parity-case octane:registration-force-mount-release
	it('does not report a duplicate after a forceMount item is replaced', async () => {
		// Every registration path goes through the same `useValue`, so every
		// teardown has to release the value it registered. When only the plain-item
		// teardown released, re-showing a force-mounted item counted its value again
		// each time ("2 items share…", then "3…"), telling the author to fix code
		// that holds exactly one live item with that value.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const app = mount(ForceMountSwapMenu, { forced: true });
		await settle();
		app.update(ForceMountSwapMenu, { forced: false });
		await settle();
		app.update(ForceMountSwapMenu, { forced: true });
		await settle();

		const messages = warn.mock.calls.map((call) => String(call[0]));
		warn.mockRestore();

		expect(app.findAll('[cmdk-item]')).toHaveLength(1);
		expect(messages.filter((m) => m.includes('share the value'))).toEqual([]);

		app.unmount();
	});

	// @parity-case octane:registration-group-release
	it('does not report a duplicate after a group is replaced', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const app = mount(GroupSwapMenu, { first: true });
		await settle();
		app.update(GroupSwapMenu, { first: false });
		await settle();

		const messages = warn.mock.calls.map((call) => String(call[0]));
		warn.mockRestore();

		expect(app.findAll('[cmdk-group]')).toHaveLength(1);
		expect(app.find('[cmdk-group]').getAttribute('data-value')).toBe('Fruits');
		expect(messages.filter((m) => m.includes('share the value'))).toEqual([]);

		app.unmount();
	});
});
