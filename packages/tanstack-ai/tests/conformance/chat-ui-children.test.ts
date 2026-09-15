import { afterEach, expect, it } from 'vitest';
import { mount } from '../../../octane/tests/_helpers';
import { ChatUIChildren } from '../_fixtures/chat-ui-children.tsrx';

afterEach(() => document.body.replaceChildren());

it('chat UI widgets render template children and call render props', () => {
	const result = mount(ChatUIChildren);
	try {
		expect(result.find('#messages-template').textContent).toBe('messages-template');
		expect(result.find('#messages-callback').textContent).toBe('1');
		expect(result.find('#message-template').textContent).toBe('message-template');
		expect(result.find('#message-callback').textContent).toBe('1');
		expect(result.find('#part-template').textContent).toBe('part-template');
		expect(result.find('#part-callback').textContent).toBe('text');
		expect(result.find('#interrupts-template').textContent).toBe('interrupts-template');
		expect(result.find('#interrupts-callback').textContent).toBe('1');
		expect(result.find('#interrupt-template').textContent).toBe('interrupt-template');
		expect(result.find('#interrupt-callback').textContent).toBe('choose');
		expect(result.find('#input-template').textContent).toBe('input-template');
		expect(result.find('#input-callback').textContent).toBe('ready');
		expect(result.find('#approval-template').textContent).toBe('approval-template');
		expect(result.find('#approval-callback').textContent).toBe('sell');
	} finally {
		result.unmount();
	}
});
