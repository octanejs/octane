import { createConversationOperations } from './operations.ts';

// Imported only by the server-function block and server routes. Both examples
// share the same authorized operation store, never a browser-side singleton.
export const conversations = createConversationOperations(async function* (input, signal) {
	yield 'Working on ' + input.prompt;
	await new Promise<void>((resolve) => {
		const timer = setTimeout(done, 600);
		function done() {
			clearTimeout(timer);
			signal.removeEventListener('abort', done);
			resolve();
		}
		signal.addEventListener('abort', done, { once: true });
		if (signal.aborted) done();
	});
	signal.throwIfAborted();
	yield 'Completed: ' + input.prompt;
}, 5_000);
