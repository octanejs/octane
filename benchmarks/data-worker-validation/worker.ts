/** The data worker as a Node worker thread. See owner.ts. */
import { parentPort, workerData } from 'node:worker_threads';
import { startOwner, type Control, type Wire } from './owner.ts';

const { count, validate, wire } = workerData as { count: number; validate: boolean; wire: Wire };
const handle = startOwner(count, validate, wire);
parentPort!.on('message', (message: Control) => {
	const answer = handle(message);
	if (answer) parentPort!.postMessage(answer);
});
