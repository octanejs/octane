/** The data worker as a Node worker thread. See owner.ts. */
import { parentPort, workerData } from 'node:worker_threads';
import { startOwner, type Control } from './owner.ts';

const { count, validate } = workerData as { count: number; validate: boolean };
const handle = startOwner(count, validate);
parentPort!.on('message', (message: Control) => {
	const answer = handle(message);
	if (answer) parentPort!.postMessage(answer);
});
