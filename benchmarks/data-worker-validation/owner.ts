/**
 * The data worker's owner, shared by the Node worker thread and the
 * Chromium worker: one owner over a local transport that answers with
 * `count` rows. With `validate`, it is given the build's contracts and
 * validates replies and restored values for the tab.
 */
import { createDataOwner, memoryStorage, type OwnerPort, type Transport } from 'octane/data';
import { KEY, PARTITION, counter, makeRows, rows } from './contracts.ts';

/** What the tab sends the worker. */
export interface Control {
	port?: OwnerPort;
	offline?: boolean;
	calls?: true;
}

/** Start the owner; the result handles each message from the tab and returns any answer. */
export function startOwner(count: number, validate: boolean) {
	let round = 0;
	let offline = false;
	const transport: Transport = () =>
		offline
			? new Promise(() => {})
			: Promise.resolve({ ok: true, value: makeRows(count, ++round) });
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
	return (message: Control): { calls: number; saves: number } | undefined => {
		if (message.port) owner.connect(message.port);
		if (message.offline !== undefined) offline = message.offline;
		return message.calls ? { calls: counter.calls, saves } : undefined;
	};
}
