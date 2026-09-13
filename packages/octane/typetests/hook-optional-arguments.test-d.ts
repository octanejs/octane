import { useDeferredValue } from 'octane';
import {
	useDeferredValue as useServerDeferredValue,
	useSyncExternalStore as useServerSyncExternalStore,
} from 'octane/server';
import { useDeferredValue as useUniversalDeferredValue } from 'octane/universal/native';

const slot = Symbol('forwarded hook');

// A supplied preview keeps the existing optional-argument acceptance.
const preview = useDeferredValue('ready', false);

// These public helpers accept forwarded optional arguments. Their declarations
// retain that surface independently of how the runtime reads those arguments.
const client = useDeferredValue('ready', false, 'forwarded', slot);
const server = useServerDeferredValue('ready', false, 'forwarded', slot);
const universal = useUniversalDeferredValue('ready', false, 'forwarded', slot);
const snapshot = useServerSyncExternalStore(
	() => () => {},
	() => 'client',
	() => 'server',
	'forwarded',
	slot,
);
const results: string[] = [preview, client, server, universal, snapshot];

// Optional arguments do not replace the value/getSnapshot generic inference.
// @ts-expect-error The client deferred result retains the input value type.
const wrongClient: number = client;
// @ts-expect-error The server deferred result retains the input value type.
const wrongServer: number = server;
// @ts-expect-error The universal deferred result retains the input value type.
const wrongUniversal: number = universal;
// @ts-expect-error The server snapshot result retains getSnapshot's value type.
const wrongSnapshot: number = snapshot;
