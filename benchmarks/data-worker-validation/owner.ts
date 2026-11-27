/**
 * The data worker's owner, shared by the Node worker thread and the
 * Chromium worker: one owner over a local transport that answers with
 * `count` rows. With `validate`, it is given the build's contracts and
 * validates replies and restored values for the tab.
 */
import * as devalue from 'devalue';
import {
	createDataOwner,
	memoryStorage,
	serverTransport,
	type DataReply,
	type OwnerPort,
	type Transport,
} from 'octane/data';
import { createDataHandler } from 'octane/data/server';
import { KEY, PARTITION, counter, makeRows, rows, servedRows } from './contracts.ts';

/**
 * How a reply reaches the owner: `none` hands it the rows; `json` and
 * `devalue` encode it in a `createDataHandler` and decode it in the client
 * transport, both in the worker, as JSON where exact (`serverTransport`) or as
 * devalue (a client that does not ask, as an earlier one).
 */
export type Wire = 'none' | 'json' | 'devalue';

/** What the tab sends the worker. */
export interface Control {
	port?: OwnerPort;
	offline?: boolean;
	calls?: true;
}

/** Start the owner; the result handles each message from the tab and returns any answer. */
export function startOwner(count: number, validate: boolean, wire: Wire = 'none') {
	let round = 0;
	let offline = false;
	/** The replies sent over the wire, and their characters. */
	let replies = 0;
	let replyChars = 0;
	const handler = createDataHandler({}, (handle) => [
		handle(servedRows, () => makeRows(count, ++round)),
	]);
	const call = { request: new Request('http://bench.test/'), signal: new AbortController().signal };
	const send = async (text: string) => {
		const reply = await handler.serve(text, call as never);
		replies++;
		replyChars += reply.length;
		return reply;
	};
	const json = serverTransport(send);
	const transport: Transport = async (request, signal) =>
		offline
			? new Promise(() => {})
			: wire === 'json'
				? json(request, signal)
				: wire === 'devalue'
					? (devalue.parse(await send(devalue.stringify(request))) as DataReply)
					: { ok: true, value: makeRows(count, ++round) };
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
	return (
		message: Control,
	): { calls: number; saves: number; replies: number; replyChars: number } | undefined => {
		if (message.port) owner.connect(message.port);
		if (message.offline !== undefined) offline = message.offline;
		return message.calls ? { calls: counter.calls, saves, replies, replyChars } : undefined;
	};
}
