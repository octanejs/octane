/**
 * The data worker: one owner over a local transport that answers with
 * `ROWS` rows. With `validate`, it is given the build's contracts and
 * validates replies and restored values for the tab.
 */
import { createDataOwner, memoryStorage, type Transport } from 'octane/data';
import { parentPort, workerData, type MessagePort } from 'node:worker_threads';
import { KEY, PARTITION, counter, makeRows, rows } from './contracts.ts';

const { count, validate } = workerData as { count: number; validate: boolean };
let round = 0;
let offline = false;
const transport: Transport = () =>
	offline ? new Promise(() => {}) : Promise.resolve({ ok: true, value: makeRows(count, ++round) });
const memory = memoryStorage();
/** Values the owner saved to the cache. */
let saves = 0;
const storage: typeof memory = {
	...memory,
	commit(partition, put, remove) {
		saves += put.filter((item) => item.value !== undefined).length;
		return memory.commit(partition, put, remove);
	},
};
const owner = createDataOwner({
	transport,
	persist: () => ({ storage, partition: PARTITION, key: KEY }),
	contracts: validate ? [rows] : undefined,
});

parentPort!.on('message', (message: { port?: MessagePort; offline?: boolean; calls?: true }) => {
	if (message.port) owner.connect(message.port as never);
	if (message.offline !== undefined) offline = message.offline;
	if (message.calls) parentPort!.postMessage({ calls: counter.calls, saves });
});
