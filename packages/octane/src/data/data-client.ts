/**
 * An application's data client: how it reaches its server, declared once. The
 * Vite and Rspack plugins' `dataClient` option builds the data worker from it
 * and generates `octane/data/client`, whose `openDataStore` connects a page to
 * that worker. The worker and the page take the same transport, listener and
 * persistence from one module, so neither is configured twice.
 */
import type { Feed, Listener, Read, Transport, Write } from './contracts.js';
import {
	createReplica,
	serveDataOwner,
	sharedOwner,
	type DataOwner,
} from './owner.js';
import type { PersistOptions } from './persist.js';
import type { DataStore, DataStoreOptions } from './store.js';

export interface DataClient {
	/** How requests reach the server. The data worker makes them; a page does only as its own store. */
	readonly transport: Transport;
	/** How feeds connect, where the app has feeds. The data worker holds the connections. */
	readonly listen?: Listener | undefined;
	/**
	 * The signed-in account's encrypted cache and write journal. The data worker
	 * is their only writer; a page uses them only as its own store.
	 */
	readonly persist?: ((account: string) => PersistOptions) | undefined;
}

/** What a page passes when it opens its store: what its server render sent. */
export type OpenDataStoreOptions = Pick<DataStoreOptions, 'seed' | 'seedAge' | 'form'>;

type Contracts = ReadonlyArray<Read<any, any> | Write<any, any> | Feed<any, any>>;

/** Declare the application's data client, as the default export of the module `dataClient` names. */
export function defineDataClient(client: DataClient): DataClient {
	return client;
}

/** @internal Serve the client's owner: the data worker the plugins generate calls this. */
export function serveDataClient(client: DataClient, contracts: Contracts): DataOwner {
	return serveDataOwner({
		transport: client.transport,
		listen: client.listen,
		persist: client.persist,
		contracts,
	});
}

/** @internal Open `account`'s store over the data worker: `openDataStore` in `octane/data/client`. */
export function openDataClient(
	client: DataClient,
	contracts: Contracts,
	account: string,
	options: OpenDataStoreOptions = {},
): DataStore {
	return createReplica(sharedOwner(account), {
		...options,
		transport: client.transport,
		listen: client.listen,
		persist: client.persist?.(account),
		contracts,
	});
}
