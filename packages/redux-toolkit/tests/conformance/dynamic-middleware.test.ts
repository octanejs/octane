import { beforeEach, describe, expect, it } from 'vitest';
import { mount, settle } from '../_helpers';
import { DynamicMiddlewareApp, observedActions, store } from '../_fixtures/dynamic-middleware.tsrx';

beforeEach(() => {
	observedActions.length = 0;
});

describe('dynamic middleware Octane integration', () => {
	it('injects middleware and returns a dispatch hook bound to @octanejs/redux', async () => {
		const initialCount = store.getState().value;
		const result = mount(DynamicMiddlewareApp, {});
		const button = result.find('#dynamic-dispatch');
		expect(button.textContent).toBe('count=' + initialCount);

		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(store.getState().value).toBe(initialCount + 1);
		await settle(1);
		expect(button.textContent).toBe('count=' + (initialCount + 1));
		expect(observedActions).toEqual(['counter/increment']);
		result.unmount();
	});
});
