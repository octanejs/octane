import { describe, expect, it, vi } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { settle } from './_command-helpers';
import { DuplicateValueMenu } from './_fixtures/basic.tsrx';

describe('@octanejs/cmdk — duplicate-value warning divergence', () => {
	it('reports duplicate item values in development', async () => {
		// Two items sharing a value both render aria-selected while only the first
		// responds to Enter. The runtime cannot pick a winner, so it must say so
		// rather than silently producing a listbox with two selected options.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const app = mount(DuplicateValueMenu);
		await settle();

		const messages = warn.mock.calls.map((call) => String(call[0]));
		warn.mockRestore();

		expect(messages.some((m) => m.includes('share the value') && m.includes('Apple'))).toBe(true);

		app.unmount();
	});
});
