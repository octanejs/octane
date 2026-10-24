import { registerResponseReader } from '../server-rpc-client.js';

/**
 * Compiler target, called once by each module with server function stubs. The
 * reader's dynamic import lives here, outside the `octane` entry, so a build
 * without server functions never sees it: single-file builds would otherwise
 * wrap the modules it shares for lazy initialization.
 * @internal
 */
export function __serverRpcPreload(): void {
	registerResponseReader(() => import('../server-rpc-response.js'));
}
