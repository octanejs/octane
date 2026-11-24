/**
 * The modules the Vite and Rspack plugins generate from the `dataClient`
 * option: the data worker, which serves the client's owner, and
 * `octane/data/client`, which opens a page's store over it. Both read the
 * client from the one module the option names, and the build's contracts
 * from the generated manifest.
 */
import { DATA_MANIFEST_MODULE } from './data-contracts.js';

export const DATA_CLIENT_MODULE = 'octane/data/client';
/** Where the generated modules find the helpers they call; not for applications. */
const DATA_CLIENT_INTERNAL = 'octane/internal/data-client';

/** The data worker's source, for the client module at `file`. */
export function dataClientWorker(file) {
	return (
		`import client from ${JSON.stringify(file)};\n` +
		`import { contracts } from ${JSON.stringify(DATA_MANIFEST_MODULE)};\n` +
		`import { serveDataClient } from ${JSON.stringify(DATA_CLIENT_INTERNAL)};\n` +
		`serveDataClient(client, contracts);\n`
	);
}

/** `octane/data/client`'s source, for the client module at `file`. */
export function dataClientModule(file) {
	return (
		`import client from ${JSON.stringify(file)};\n` +
		`import { contracts } from ${JSON.stringify(DATA_MANIFEST_MODULE)};\n` +
		`import { openDataClient } from ${JSON.stringify(DATA_CLIENT_INTERNAL)};\n` +
		`export function openDataStore(account, options) {\n` +
		`\treturn openDataClient(client, contracts, account, options);\n` +
		`}\n`
	);
}
