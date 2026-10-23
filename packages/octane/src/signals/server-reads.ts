import { createNativeServerReadDriver } from './native-read-server.js';
import { supplyNativeServerReads } from './read-protocol.js';

/**
 * A server render collects its signal reads for the hydration snapshot only
 * while a read driver exists. Installed by the graph itself, the driver exists
 * whenever signals do, so collection never depends on which modules this
 * process happened to load first. `#octane/signals/server-reads` resolves here
 * except under the `browser` condition, where `server-reads-elsewhere.ts`
 * keeps the driver out of client bundles. The server query-attempt observer
 * follows the same seam: only a server render installs an observer.
 */
export function installServerReads(): void {
	supplyNativeServerReads(createNativeServerReadDriver);
}

export {
	captureCurrentServerSignalQueryAttemptObserver,
	hasServerSignalQueryAttemptObserver,
	runAsDeclaredServerSignalReader,
	serverSignalQueryAttemptObserver,
} from './query-attempt-observer.js';
