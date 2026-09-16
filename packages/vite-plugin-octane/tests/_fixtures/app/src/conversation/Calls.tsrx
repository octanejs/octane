import type { ConversationFrame, ConversationPage, OperationInput } from './operations.ts';

module server {
	import type { ServerCallContext } from 'octane/server';
	import { conversations } from './host.ts';

	export function readConversation(id: string, context: ServerCallContext) {
		return conversations.read(id, context);
	}

	export function readConversationPage(
		id: string,
		before: string | null,
		context: ServerCallContext,
	) {
		return conversations.page(id, before, context);
	}

	export function watchConversation(id: string, context: ServerCallContext) {
		return conversations.watch(id, context);
	}

	export function startConversation(input: OperationInput, context: ServerCallContext) {
		return conversations.start(input, context);
	}

	export function readReceipt(operationId: string, context: ServerCallContext) {
		return conversations.receipt(operationId, context);
	}

	export function stopConversation(operationId: string, context: ServerCallContext) {
		return conversations.stop(operationId, context);
	}
}

import {
	readConversation,
	readConversationPage,
	readReceipt,
	startConversation,
	stopConversation,
	watchConversation,
} from 'server';

export { readConversation, readConversationPage, readReceipt, startConversation, stopConversation, watchConversation };
export type { ConversationFrame, ConversationPage };
