import { renderHook, waitFor } from '@octanejs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import type { ChatFetcher } from '@tanstack/ai-client';
import { useChat } from '../../../src/use-chat.tsrx';
import { createTextChunks } from '../test-utils';

describe('useChat — fetcher transport', () => {
	// Octane divergence note.
	it('uses an updated fetcher without losing conversation state', async () => {
		const firstFetcher = vi.fn<ChatFetcher>(async function* () {
			yield* createTextChunks('First response', 'first-response');
		});
		const secondFetcher = vi.fn<ChatFetcher>(async function* () {
			yield* createTextChunks('Second response', 'second-response');
		});

		const { result, rerender } = renderHook(
			({ fetcher }: { fetcher: ChatFetcher }) => useChat({ fetcher }),
			{ initialProps: { fetcher: firstFetcher } },
		);

		await result.current.sendMessage('First request');
		await waitFor(() => {
			expect(firstFetcher).toHaveBeenCalledTimes(1);
			expect(result.current.messages).toHaveLength(2);
		});

		rerender({ fetcher: secondFetcher });
		await result.current.sendMessage('Second request');

		await waitFor(() => {
			expect(secondFetcher).toHaveBeenCalledTimes(1);
			expect(result.current.messages).toHaveLength(4);
		});
		expect(firstFetcher).toHaveBeenCalledTimes(1);
		const renderedText = result.current.messages
			.flatMap((message) => message.parts)
			.filter((part) => part.type === 'text')
			.map((part) => part.content);
		expect(renderedText).toContain('First response');
		expect(renderedText).toContain('Second response');
	});
});
