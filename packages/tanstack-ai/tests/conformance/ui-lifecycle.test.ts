import { expect, it } from 'vitest';
import { act, createRoot } from 'octane';
import { PortalChat } from '../_fixtures/ui-lifecycle.tsrx';
import type { UIMessage } from '@tanstack/ai-client';

// @parity-case conformance:ai-ui-portal-suspense
it('preserves chat context and widget identity through portal suspension and thread replacement', async () => {
	const container = document.createElement('main');
	const target = document.createElement('aside');
	document.body.append(container, target);
	const messages = (text: string): UIMessage[] => [
		{ id: 'one', role: 'assistant', parts: [{ type: 'text', content: text }] },
	];
	let resolve!: (value: string) => void;
	const ready = new Promise<string>((complete) => {
		resolve = complete;
	});
	let props = { threadId: 'first', initialMessages: messages('First'), target, ready, fail: false };
	const root = createRoot(container);
	let widget: Element | null = null;
	try {
		await act(async () => root.render(PortalChat, props));
		expect(container.textContent).toBe('Loading chat');
		expect(target.textContent).toBe('');
		await act(async () => resolve('ready'));
		widget = target.querySelector('#chat-widget');
		expect(widget?.textContent).toBe('First');
		expect(widget?.getAttribute('data-count')).toBe('1');
		props = { ...props, threadId: 'second', initialMessages: messages('Second') };
		await act(async () => root.render(PortalChat, props));
		expect(target.querySelector('#chat-widget')).toBe(widget);
		expect(widget?.textContent).toBe('Second');
		await act(async () => root.render(PortalChat, { ...props, fail: true }));
		expect(container.querySelector('#chat-error')?.textContent).toBe('chat widget failed');
		expect(target.textContent).toBe('');
	} finally {
		root.unmount();
		container.remove();
		target.remove();
	}
	expect(widget?.isConnected).toBe(false);
});
