/**
 * The shelf's data worker. The build emits it at `/_octane/data-worker.js`,
 * and a page opened with `?owner=shared` connects to it, so every such tab
 * shares one owner: one request per read, one feed connection, and each
 * other's pending edits and rollbacks.
 */
import { serveDataOwner, serverListener, serverTransport } from 'octane/data';
import { data, events } from './data.tsrx';

serveDataOwner({ transport: serverTransport(data), listen: serverListener(events) });
