import { createStartHandler, defaultStreamHandler } from './server.js';

const fetch = createStartHandler(defaultStreamHandler);

export function createServerEntry(entry) {
	return {
		async fetch(...args) {
			return await entry.fetch(...args);
		},
	};
}

export default createServerEntry({ fetch });
