/** @jsxImportSource octane */
import { expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { Chat, ChatInput, ChatMessages, ChatMessage, TextPart } from '../../src/ui';
import { createTextChunks } from './test-utils';

// @parity-case conformance:ai-ui-native-input
it('renders markdown and submits the latest native input value on Enter', async () => {
	const connect = vi.fn(async function* () {
		yield* createTextChunks('Received');
	});
	const mounted = render(
		<Chat
			connection={{ connect }}
			initialMessages={[
				{ id: 'welcome', role: 'assistant', parts: [{ type: 'text', content: '**Welcome**' }] },
			]}
		>
			<ChatMessages>
				{(message) => (
					<ChatMessage
						message={message}
						textPartRenderer={({ content }) => <TextPart content={content} />}
					/>
				)}
			</ChatMessages>
			<ChatInput placeholder="Message" />
		</Chat>,
	);
	expect(mounted.container.querySelector('strong')?.textContent).toBe('Welcome');
	const input = mounted.getByPlaceholderText('Message') as HTMLInputElement;
	act(() => {
		fireEvent.input(input, { target: { value: 'Hello' } });
	});
	act(() => {
		fireEvent.keyDown(input, { key: 'Enter' });
	});
	await waitFor(() => expect(mounted.container.textContent).toContain('Received'));
	expect(connect).toHaveBeenCalledTimes(1);
	expect(mounted.container.textContent).toContain('Hello');
	expect(input.value).toBe('');
	expect(mounted.getByPlaceholderText('Message')).toBe(input);
	mounted.unmount();
	expect(input.isConnected).toBe(false);
});
