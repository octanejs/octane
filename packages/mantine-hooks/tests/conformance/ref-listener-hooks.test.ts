import { describe, expect, it, vi } from 'vitest';
import { mount } from '../_helpers';
import { RefListenerHarness } from '../_fixtures/ref-listener-hooks.tsrx';

describe('@octanejs/mantine-hooks callback ref listener lifecycle', () => {
	it('detaches replaced nodes without allowing stale cleanup to detach the replacement', () => {
		const onClick = vi.fn();
		const removeEventListener = vi.spyOn(HTMLElement.prototype, 'removeEventListener');
		const result = mount(RefListenerHarness, { replacement: false, onClick });
		const oldEventNode = result.find('#event-node');
		const oldFocusNode = result.find('#focus-node');

		result.update(RefListenerHarness, { replacement: true, onClick });
		const replacementEventNode = result.find('#event-node');
		replacementEventNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(onClick).toHaveBeenCalledOnce();
		expect(removeEventListener.mock.instances).toContain(oldEventNode);
		expect(removeEventListener.mock.instances).toContain(oldFocusNode);

		result.unmount();
		expect(removeEventListener.mock.instances).toContain(replacementEventNode);
		removeEventListener.mockRestore();
	});
});
