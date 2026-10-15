import { createStartHandler, defaultStreamHandler } from './server.ts';

const handler = createStartHandler(defaultStreamHandler);

export default {
	async fetch(...args) {
		return await handler(...args);
	},
};
