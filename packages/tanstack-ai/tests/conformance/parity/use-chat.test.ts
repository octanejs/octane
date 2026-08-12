import { waitFor } from '@octanejs/testing-library';
import { describe, expect, it } from 'vitest';
import { createMockConnectionAdapter, createTextChunks, renderUseChat } from '../test-utils';

describe('useChat', () => {
	describe('initialization', () => {
		// Octane divergence note.
		it('should generate id if not provided', async () => {
			const chunks = createTextChunks('Response');
			const adapter = createMockConnectionAdapter({ chunks });

			const { result } = renderUseChat({ connection: adapter });

			await result.current.sendMessage('Test');

			await waitFor(() => {
				expect(result.current.messages.length).toBeGreaterThan(0);
			});

			// Message IDs should have a generated prefix (not "custom-id-")
			const messageId = result.current.messages[0]!.id;
			expect(messageId).toBeTruthy();
			expect(messageId).not.toMatch(/^custom-id-/);
		});
	});
});
