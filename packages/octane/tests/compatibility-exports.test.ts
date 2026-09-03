import { describe, expect, it, vi } from 'vitest';
import * as Octane from 'octane';
import * as Server from 'octane/server';
import { act, mount } from './_helpers.js';
import { LegacyActionForm } from './_fixtures/host-update-contract.tsrx';

const effectSlot = Symbol('compat-effect');
const formStatusSlot = Symbol('compat-form-status');

describe('migration exports', () => {
	it('reports an idle form status with no method outside a submitting form', () => {
		let status: Octane.FormStatus | undefined;
		const mounted = mount(() => {
			status = Octane.useFormStatus(formStatusSlot);
			return null;
		});
		expect(status).toEqual({ pending: false, data: null, method: null, action: null });
		mounted.unmount();
	});
	it('compiles the deprecated form-state hook inside StrictMode', async () => {
		const mounted = mount(LegacyActionForm);
		expect(mounted.find('button').textContent).toBe('0');
		await act(async () => {
			mounted.find('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		});
		expect(mounted.find('button').textContent).toBe('1');
		mounted.unmount();
	});
	it('renders StrictMode children without adding a host or replaying effects', () => {
		const effect = vi.fn();
		function Child() {
			Octane.useLayoutEffect(effect, [], effectSlot);
			return Octane.createElement('button', null, 'child');
		}
		const mounted = mount(() =>
			Octane.createElement(Octane.StrictMode, {}, Octane.createElement(Child)),
		);
		expect(mounted.container.children).toHaveLength(1);
		expect(mounted.find('button').textContent).toBe('child');
		expect(effect).toHaveBeenCalledTimes(1);
		mounted.unmount();
	});

	it('preserves batching callback arguments, return values, and errors', () => {
		expect(Octane.unstable_batchedUpdates((value: number) => value + 1, 2)).toBe(3);
		const error = new Error('callback');
		expect(() =>
			Octane.unstable_batchedUpdates(() => {
				throw error;
			}),
		).toThrow(error);
	});

	it('exports the deprecated form-state alias in both environments', () => {
		expect(Octane.useFormState).toBe(Octane.useActionState);
		expect(Server.useFormState).toBe(Server.useActionState);
	});
});
