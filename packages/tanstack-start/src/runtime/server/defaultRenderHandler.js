import { defineHandlerCallback } from '@tanstack/start-server-core';
import { renderRouterToString } from '@octanejs/tanstack-router/ssr/server';
import { StartServer } from './StartServer.js';

export const defaultRenderHandler = defineHandlerCallback(({ router, responseHeaders }) =>
	renderRouterToString({
		router,
		responseHeaders,
		App: StartServer,
	}),
);
