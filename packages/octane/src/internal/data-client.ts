/**
 * What the modules the Vite and Rspack plugins generate from the `dataClient`
 * option call: the data worker serves the client's owner, and
 * `openDataStore` in `octane/data/client` opens a page's store over it. Not
 * for applications, which declare the client with `defineDataClient` from
 * `octane/data`.
 * @internal
 */
import type { Feed, Read, Write } from '../data/contracts.js';
import type { DataClient, OpenDataStoreOptions } from '../data/data-client.js';
import { createReplica, serveDataOwner, sharedOwner, type DataOwner } from '../data/owner.js';
import type { DataStore } from '../data/store.js';

type Contracts = ReadonlyArray<Read<any, any> | Write<any, any> | Feed<any, any>>;

/** Serve the client's owner: what the generated data worker calls. */
export function serveDataClient(client: DataClient, contracts: Contracts): DataOwner {
	return serveDataOwner({
		transport: client.transport,
		listen: client.listen,
		persist: client.persist,
		contracts,
	});
}

/** Open `account`'s store over the data worker: what `openDataStore` in `octane/data/client` calls. */
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
