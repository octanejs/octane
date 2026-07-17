import { useChat } from '@octanejs/tanstack-ai';

// Deterministic, framework-agnostic chat fixture. The ONLY binding-specific
// import is `useChat` (rewritten to `@tanstack/ai-react` on the React side by
// tests/differential/_setup.ts). Everything else is plain data: an in-memory
// `connection` adapter that streams a fixed assistant reply with NO network and
// NO timers of its own. The chunk shapes mirror `@tanstack/ai-client`'s AG-UI
// wire format (TEXT_MESSAGE_CONTENT deltas + a terminal RUN_FINISHED), inlined
// here so the fixture pulls in nothing from `octane`, `@octanejs/*`, or the
// vitest-dependent conformance helpers — which would break the React compile
// and would not resolve from the `.react-cache/` output directory anyway.

function createTextChunks(text, messageId) {
	const chunks = [];
	let accumulated = '';
	for (const character of text) {
		accumulated += character;
		chunks.push({
			type: 'TEXT_MESSAGE_CONTENT',
			messageId,
			model: 'test',
			timestamp: 0,
			delta: character,
			content: accumulated,
		});
	}
	chunks.push({
		type: 'RUN_FINISHED',
		runId: 'run-' + messageId,
		threadId: 'thread-' + messageId,
		model: 'test',
		timestamp: 0,
		finishReason: 'stop',
	});
	return chunks;
}

// A connection adapter yields a fresh async generator per connect(), so each
// send streams the same fixed assistant reply independently on both runtimes.
const connection = {
	async *connect() {
		for (const chunk of createTextChunks('Hi there', 'assistant-1')) {
			yield chunk;
		}
	},
};

function textOf(message) {
	return message.parts.map((part) => ('content' in part ? part.content : '')).join('');
}

export function ChatParity() @{
	const { messages, sendMessage } = useChat({ connection });

	<>
		<ul id="messages">
			@for (const message of messages; key message.id) {
				<li>{(message.role + ': ' + textOf(message)) as string}</li>
			}
		</ul>
		<button
			id="send"
			onClick={() => {
				void sendMessage('hi');
			}}
		>
			send
		</button>
	</>
}
