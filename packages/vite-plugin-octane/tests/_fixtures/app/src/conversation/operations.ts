import type { ServerCallContext } from 'octane/server';

export interface OperationInput {
	operationId: string;
	conversationId: string;
	prompt: string;
}

export interface ConversationTurn {
	id: string;
	prompt: string;
	answer: string;
	status: 'running' | 'complete' | 'stopped' | 'timed-out' | 'failed';
}

export interface ConversationFrame {
	conversationId: string;
	revision: number;
	turns: ConversationTurn[];
}

export interface ConversationPage extends ConversationFrame {
	nextCursor: string | null;
}

/**
 * Shared HTTP/UI test host, not a production durable store. A real host persists
 * the operation/receipt atomically and schedules generation on its durable job
 * system. Subscriber cancellation never owns an accepted job's AbortController.
 */
export function createConversationOperations(
	generate: (input: OperationInput, signal: AbortSignal) => AsyncIterable<string>,
	timeoutMs = 30_000,
) {
	const conversations = new Map<string, { frame: ConversationFrame; changed: Set<() => void> }>();
	const operations = new Map<
		string,
		{ input: OperationInput; turn: ConversationTurn; stop: () => void }
	>();
	function viewer(context: ServerCallContext): string {
		if (typeof context.viewer !== 'string' || !context.viewer)
			throw new Error('Authorization required');
		return context.viewer;
	}
	function conversation(id: string, context: ServerCallContext) {
		const key = JSON.stringify([viewer(context), id]);
		let value = conversations.get(key);
		if (value === undefined) {
			value = { frame: { conversationId: id, revision: 0, turns: [] }, changed: new Set() };
			conversations.set(key, value);
		}
		return value;
	}
	function publish(source: ReturnType<typeof conversation>) {
		source.frame.revision++;
		for (const wake of source.changed) wake();
	}
	function read(id: string, context: ServerCallContext): ConversationFrame {
		return structuredClone(conversation(id, context).frame);
	}
	function page(id: string, before: string | null, context: ServerCallContext): ConversationPage {
		context.signal.throwIfAborted();
		const frame = read(id, context);
		const end =
			before === null ? frame.turns.length : frame.turns.findIndex((turn) => turn.id === before);
		if (end < 0) throw new Error('Invalid conversation cursor');
		const start = Math.max(0, end - 2);
		return {
			...frame,
			turns: frame.turns.slice(start, end),
			// Stable turn anchors cannot shift when a newer generation is appended.
			nextCursor: start > 0 ? frame.turns[start]!.id : null,
		};
	}
	function start(input: OperationInput, context: ServerCallContext) {
		context.signal.throwIfAborted();
		if (
			!input.operationId ||
			!input.conversationId ||
			!input.prompt ||
			input.prompt.length > 4_000
		) {
			throw new Error('Invalid operation');
		}
		const key = JSON.stringify([viewer(context), input.operationId]);
		const existing = operations.get(key);
		if (existing !== undefined) {
			if (
				existing.input.conversationId !== input.conversationId ||
				existing.input.prompt !== input.prompt
			) {
				throw new Error('Operation ID already names different input');
			}
			return { operationId: input.operationId, conversationId: input.conversationId };
		}
		if (operations.size >= 128) throw new Error('Fixture operation capacity reached');
		const ownedInput = Object.freeze({ ...input });
		const source = conversation(input.conversationId, context);
		const turn: ConversationTurn = {
			id: input.operationId,
			prompt: input.prompt,
			answer: '',
			status: 'running',
		};
		const cancellation = new AbortController();
		let timer: ReturnType<typeof setTimeout>;
		let iterator: AsyncIterator<string> | undefined;
		const finish = (status: ConversationTurn['status']) => {
			if (turn.status !== 'running') return;
			turn.status = status;
			clearTimeout(timer);
			cancellation.abort();
			try {
				void Promise.resolve(iterator?.return?.()).catch(() => {});
			} catch {
				/* Fence still holds. */
			}
			publish(source);
		};
		// The receipt is indexed before private work starts: duplicate dispatches
		// join this operation even when its first acknowledgement was lost.
		operations.set(key, { input: ownedInput, turn, stop: () => finish('stopped') });
		source.frame.turns.push(turn);
		publish(source);
		timer = setTimeout(() => finish('timed-out'), timeoutMs);
		void (async () => {
			try {
				iterator = generate(ownedInput, cancellation.signal)[Symbol.asyncIterator]();
				while (turn.status === 'running') {
					const next = await iterator.next();
					if (turn.status !== 'running') break;
					if (next.done) {
						finish('complete');
						break;
					}
					if (typeof next.value !== 'string' || next.value.length > 1024 * 1024)
						throw new Error('Invalid fixture output');
					turn.answer = next.value;
					publish(source);
				}
			} catch {
				finish('failed');
			}
		})();
		return { operationId: input.operationId, conversationId: input.conversationId };
	}
	function receipt(operationId: string, context: ServerCallContext) {
		const operation = operations.get(JSON.stringify([viewer(context), operationId]));
		if (operation === undefined) return null;
		return {
			operationId,
			conversationId: operation.input.conversationId,
			status: operation.turn.status,
		};
	}
	function stop(operationId: string, context: ServerCallContext) {
		const operation = operations.get(JSON.stringify([viewer(context), operationId]));
		if (operation === undefined) throw new Error('Operation not found');
		operation.stop();
		return receipt(operationId, context);
	}
	async function* watch(id: string, context: ServerCallContext) {
		const source = conversation(id, context);
		let revision = -1;
		while (!context.signal.aborted) {
			if (source.frame.revision !== revision) {
				revision = source.frame.revision;
				yield read(id, context);
				continue;
			}
			let wake!: () => void;
			try {
				await new Promise<void>((resolve) => {
					wake = resolve;
					source.changed.add(wake);
					context.signal.addEventListener('abort', wake, { once: true });
					if (context.signal.aborted) wake();
				});
			} finally {
				source.changed.delete(wake);
				context.signal.removeEventListener('abort', wake);
			}
		}
	}
	return { start, read, page, watch, receipt, stop };
}
