import { expect, it } from 'vitest';
import { act, mount } from './_helpers.js';
import { TransitionLayoutAction } from './_fixtures/transition-layout-action.tsrx';

it('finishes an Action started by a layout effect after an earlier Action commits', async () => {
	const root = mount(TransitionLayoutAction, {});
	try {
		expect(root.find('output').textContent).toBe('false:0');
		await act(() => root.click('button'));
		expect(root.find('output').textContent).toBe('false:1');
	} finally {
		root.unmount();
	}
});
