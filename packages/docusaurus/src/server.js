import { prerender } from 'octane/static';
import { createStaticHandler, createStaticRouter } from '@octanejs/remix-router';
import { DocusaurusRouterProvider } from './client-components.tsrx';
import { createDocusaurusRoutes } from './routes.js';

function toRequest(value) {
	if (value instanceof Request) return value;
	return new Request(new URL(value, 'http://localhost'));
}

export function createDocusaurusStaticHandler(manifest, registry, options) {
	return createStaticHandler(createDocusaurusRoutes(manifest, registry), options);
}

export async function prerenderDocusaurusRoute(request, manifest, registry, options = {}) {
	const { basename, requestContext, ...renderOptions } = options;
	const handler = createDocusaurusStaticHandler(
		manifest,
		registry,
		basename === undefined ? undefined : { basename },
	);
	const context = await handler.query(
		toRequest(request),
		requestContext === undefined ? undefined : { requestContext },
	);
	if (context instanceof Response) return context;

	const router = createStaticRouter(handler.dataRoutes, context);
	// Use the hydration provider on both sides so Octane adopts the same
	// component and control-flow ranges. Router effects are inert on the server.
	const result = await prerender(
		DocusaurusRouterProvider,
		{
			manifest,
			router,
		},
		{
			headChannel: 'separate',
			...renderOptions,
		},
	);
	return {
		...result,
		context,
	};
}
