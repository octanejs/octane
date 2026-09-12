import { describe, expect, it, vi } from 'vitest';
import { createConversationOperations } from '../../vite-plugin-octane/tests/_fixtures/app/src/conversation/operations.js';

function context(viewer = 'A', cancellation = new AbortController()) {
	return { viewer, signal: cancellation.signal, request: new Request('https://octane.test/') };
}

describe('host-owned accepted conversation operations', () => {
	it('pages completed responses with stable server cursors while new turns arrive', async () => {
		const host = createConversationOperations(async function* (input) {
			yield 'Answer: ' + input.prompt;
		});
		for (let index = 1; index <= 5; index++) {
			host.start(
				{ operationId: `turn-${index}`, conversationId: 'A', prompt: `Prompt ${index}` },
				context(),
			);
		}
		await vi.waitFor(() => expect(host.receipt('turn-5', context())?.status).toBe('complete'));
		const newest = host.page('A', null, context());
		expect(newest.turns.map((turn) => turn.id)).toEqual(['turn-4', 'turn-5']);
		expect(newest.nextCursor).toBe('turn-4');
		host.start({ operationId: 'turn-6', conversationId: 'A', prompt: 'New prompt' }, context());
		await vi.waitFor(() => expect(host.receipt('turn-6', context())?.status).toBe('complete'));
		const older = host.page('A', newest.nextCursor, context());
		expect(older.turns.map((turn) => turn.id)).toEqual(['turn-2', 'turn-3']);
		const oldest = host.page('A', older.nextCursor, context());
		expect(oldest.turns.map((turn) => turn.id)).toEqual(['turn-1']);
		expect(oldest.nextCursor).toBeNull();
		expect(host.page('A', null, context()).turns.map((turn) => turn.id)).toEqual([
			'turn-5',
			'turn-6',
		]);
		newest.turns[0]!.prompt = 'Caller mutation';
		expect(host.read('A', context()).turns[3]!.prompt).toBe('Prompt 4');
	});

	it('rejects unknown or cross-authority paging cursors before returning private turns', async () => {
		const host = createConversationOperations(async function* () {
			yield 'Private answer';
		});
		host.start(
			{ operationId: 'private-turn', conversationId: 'A', prompt: 'Private prompt' },
			context(),
		);
		await vi.waitFor(() =>
			expect(host.receipt('private-turn', context())?.status).toBe('complete'),
		);
		expect(host.page('A', null, context('other-viewer')).turns).toEqual([]);
		expect(() => host.page('A', 'private-turn', context('other-viewer'))).toThrow('cursor');
		expect(() => host.page('B', 'private-turn', context())).toThrow('cursor');
		expect(() => host.page('A', 'missing', context())).toThrow('cursor');
		expect(() => host.page('A', null, context(''))).toThrow('Authorization');
	});

	it('does not return a page after its caller cancels', () => {
		const host = createConversationOperations(async function* () {});
		const cancellation = new AbortController();
		cancellation.abort();
		expect(() => host.page('A', null, context('A', cancellation))).toThrow(
			cancellation.signal.reason,
		);
	});

	it('continues after subscription cancellation and returns current progress without a second POST', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const generated = vi.fn(async function* () {
			yield 'partial';
			await gate;
			yield 'completed answer';
		});
		const host = createConversationOperations(generated);
		const cancellation = new AbortController();
		const caller = context('A', cancellation);
		const input = { operationId: 'one', conversationId: 'thread-A', prompt: 'hello' };
		const firstReceipt = host.start(input, caller);
		expect(host.start(input, caller)).toEqual(firstReceipt);
		const subscription = host.watch('thread-A', caller);
		await subscription.next();
		cancellation.abort();
		await subscription.return();
		release();
		await vi.waitFor(() => expect(host.receipt('one', context())?.status).toBe('complete'));
		const returned = host.read('thread-A', context());
		expect(returned.turns).toEqual([
			{ id: 'one', prompt: 'hello', answer: 'completed answer', status: 'complete' },
		]);
		expect(generated).toHaveBeenCalledOnce();
		expect(host.receipt('one', context('another-viewer'))).toBeNull();
	});

	it('fences ignored abort and late output after explicit Stop', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const host = createConversationOperations(async function* () {
			yield 'kept';
			await gate;
			yield 'obsolete';
		});
		host.start({ operationId: 'one', conversationId: 'A', prompt: 'hello' }, context());
		await vi.waitFor(() => expect(host.read('A', context()).turns[0]?.answer).toBe('kept'));
		host.stop('one', context());
		const stopped = host.read('A', context());
		release();
		await Promise.resolve();
		await Promise.resolve();
		expect(host.read('A', context())).toEqual(stopped);
		expect(stopped.turns[0]?.status).toBe('stopped');
	});

	it('uses a host deadline and refuses a reused operation ID with different input', async () => {
		vi.useFakeTimers();
		try {
			const host = createConversationOperations(
				() => ({
					[Symbol.asyncIterator]: () => ({
						next: () => new Promise(() => {}),
						return: async () => ({ done: true, value: undefined }),
					}),
				}),
				100,
			);
			host.start({ operationId: 'one', conversationId: 'A', prompt: 'hello' }, context());
			expect(() =>
				host.start({ operationId: 'one', conversationId: 'B', prompt: 'different' }, context()),
			).toThrow('different input');
			await vi.advanceTimersByTimeAsync(100);
			expect(host.receipt('one', context())?.status).toBe('timed-out');
		} finally {
			vi.useRealTimers();
		}
	});
});
