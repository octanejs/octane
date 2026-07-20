import { defineHandlerCallback } from '@tanstack/start-server-core';
import { renderRouterToStream } from '@octanejs/tanstack-router/ssr/server';
import { StartServer } from './StartServer.js';

export const defaultStreamHandler = defineHandlerCallback(
	async ({ request, router, responseHeaders }) =>
		await renderRouterToStream({
			request,
			router,
			responseHeaders,
			App: StartServer,
		}),
);
