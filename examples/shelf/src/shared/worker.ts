/**
 * The shelf's data worker. The build emits it at `/_octane/data-worker.js`,
 * and a page opened with `?owner=shared` connects to it, so every such tab
 * shares one owner: one request per read, one feed connection, one cache,
 * and each other's pending edits and rollbacks.
 */
import { indexedDBStorage, serveDataOwner, serverListener, serverTransport } from 'octane/data';
import { data, events } from './data.tsrx';

serveDataOwner({
	transport: serverTransport(data),
	listen: serverListener(events),
	// The account's one encrypted cache and write journal, which only this worker writes. The
	// options match a page's own (`session.ts`), so a tab that cannot share reads the same cache.
	persist: (account) => ({
		storage: indexedDBStorage({ name: 'shelf' }),
		partition: account,
		// A real app takes a random per-user secret from its signed-in session; the demo has no sign-in.
		key: `shelf demo key for ${account}`,
	}),
});
