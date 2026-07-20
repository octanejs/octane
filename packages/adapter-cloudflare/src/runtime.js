// @ts-check
/** Cloudflare-compatible primitives consumed by app-core's production handler. */

/** @import { OctaneAdapter } from '@octanejs/app-core' */

import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

/** @type {NonNullable<OctaneAdapter['runtime']>} */
export const runtime = {
	hash(value) {
		return createHash('sha256').update(value).digest('hex').slice(0, 8);
	},
	createAsyncContext() {
		const storage = new AsyncLocalStorage();
		return {
			run: (store, callback) => storage.run(store, callback),
			getStore: () => storage.getStore(),
		};
	},
};
