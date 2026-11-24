/**
 * The shelf's data worker. The build emits it at `/_octane/data-worker.js`,
 * and every page connects to it, unless opened with `?owner=local`, so an
 * account's tabs share one owner: one request per read, one feed
 * connection, one cache, and each other's pending edits and rollbacks.
 */
import { indexedDBStorage, serveDataOwner, serverListener, serverTransport } from 'octane/data';
// The build's contracts: with them, the worker validates each read's reply, so a tab of this
// build adopts it without running the schema on the page.
import { contracts } from 'octane/data/manifest';
import { data, events } from './data.tsrx';

serveDataOwner({
	transport: serverTransport(data),
	listen: serverListener(events),
	contracts,
	// The account's one encrypted cache and write journal, which only this worker writes. The
	// options match a page's own (`session.ts`), so a tab that cannot share reads the same cache.
	persist: (account) => ({
		storage: indexedDBStorage({ name: 'shelf' }),
		partition: account,
		// A real app takes a random per-user secret from its signed-in session; the demo has no sign-in.
		key: `shelf demo key for ${account}`,
	}),
});
