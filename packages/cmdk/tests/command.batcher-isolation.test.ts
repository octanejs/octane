import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { clearConsoleErrors, consoleErrorCalls } from './_setup';
import { settle, typeInput } from './_command-helpers';
import { ControlledCallbackMenu } from './_fixtures/basic.tsrx';

describe('@octanejs/cmdk — batcher isolation divergence', () => {
	it('surfaces a throwing user callback instead of swallowing it', async () => {
		// Regression: the scheduler isolated each queued callback with a bare
		// `catch {}`, so a throwing onValueChange (reached via
		// selectFirstItem -> setState('value')) disappeared silently.
		const app = mount(ControlledCallbackMenu, {
			value: '',
			onValueChange: function throwOnChange() {
				throw new Error('boom from onValueChange');
			},
		});
		await settle();

		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'app');
		await settle();

		// The failure is reported...
		const reported = consoleErrorCalls();
		expect(
			reported.some(function hasBoom(message) {
				return message.includes('boom from onValueChange');
			}),
		).toBe(true);

		// ...and the consumer-visible search update still applied.
		expect(
			app.findAll('[cmdk-item]').map(function textOf(el) {
				return el.textContent;
			}),
		).toEqual(['Apple']);

		app.unmount();
		// This test asserts on the reported error itself, so acknowledge it.
		clearConsoleErrors();
	});
});
