/**
 * The shelf's data worker. The build emits it at `/_octane/data-worker.js`,
 * and every page connects to it, unless opened with `?owner=local`, so an
 * account's tabs share one owner: one request per read, one feed
 * connection, one cache, and each other's pending edits and rollbacks.
 */
import { indexedDBStorage, serveDataOwner, serverListener, serverTransport } from 'octane/data';
// The build's contracts: with them, the worker validates what the server sends (replies,
// previews, feed events), so a tab of this build adopts it without running a schema on the page.
import { contracts } from 'octane/data/manifest';
import { data, events } from './data.tsrx';
import { faultChannel, NO_FAULTS, withFaults, type FaultMessage, type Faults } from './faults.ts';

// The account this worker serves: `sharedOwner` names it `octane-data:<protocol>:<partition>`.
const partition = self.name.split(':').slice(2).join(':');
// The demo's network faults apply here, where the account's requests are made. The pages turn
// them on and off, and list each request this worker sends.
const channel = faultChannel(partition);
let current = NO_FAULTS;
const faults = {
	get: () => current,
	set(next: Faults) {
		current = next;
		channel.postMessage({ t: 'faults', faults: next } satisfies FaultMessage);
	},
};
channel.onmessage = ({ data: message }: MessageEvent<FaultMessage>) => {
	if (message.t === 'set') faults.set(message.faults);
	else if (message.t === 'ask') faults.set(current);
	// Another worker of the account, such as another tab's dedicated one, used up a fault.
	else if (message.t === 'faults') current = message.faults;
};

serveDataOwner({
	transport: withFaults(serverTransport(data), faults, (label) =>
		channel.postMessage({ t: 'sent', label } satisfies FaultMessage),
	),
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
