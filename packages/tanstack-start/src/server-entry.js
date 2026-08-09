import { createStartHandler, defaultStreamHandler } from './server.js';
import { withAssetsFallthrough } from './assets-fallback.js';

const fetch = withAssetsFallthrough(createStartHandler(defaultStreamHandler));

export function createServerEntry(entry) {
	return {
		async fetch(...args) {
			return await entry.fetch(...args);
		},
	};
}

export default createServerEntry({ fetch });
