import { defineHandlerCallback } from '@tanstack/start-server-core';
import { renderRouterToString, renderRouterToStream } from '@octanejs/tanstack-router/ssr/server';
import { StartServer } from './StartServer.tsrx';

export { StartServer, type StartServerProps } from './StartServer.tsrx';
export * from '@tanstack/start-server-core';

export const defaultRenderHandler = defineHandlerCallback(({ router, responseHeaders }) =>
	renderRouterToString({ router, responseHeaders, App: StartServer }),
);

export const defaultStreamHandler = defineHandlerCallback(
	async ({ request, router, responseHeaders }) =>
		await renderRouterToStream({ request, router, responseHeaders, App: StartServer }),
);
