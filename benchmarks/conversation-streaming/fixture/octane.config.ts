import { defineConfig, RenderRoute, ServerRoute } from '@octanejs/vite-plugin';
import {
	authorizeRequest,
	releaseAuthorization,
	requestState,
	traceResponse,
} from './src/backend.ts';

export default defineConfig({
	middlewares: [
		async (context, next) => {
			const path = new URL(context.request.url).pathname;
			if (path === '/__bench/trace' || path === '/__bench/release-auth') return next();
			try {
				requestState(context.request);
			} catch {
				return new Response('Invalid conversation benchmark configuration', { status: 400 });
			}
			// The public document must not wait for authorization. Each actual
			// server function, including nested SSR calls, passes this gate.
			if (context.rpc !== undefined) {
				try {
					context.viewer = await authorizeRequest(context.request);
				} catch {
					return new Response('Unauthorized', { status: 401 });
				}
			}
			return next();
		},
	],
	router: {
		routes: [
			new RenderRoute({ path: '/', entry: ['App', '/src/App.tsrx'] }),
			new RenderRoute({ path: '/conversations', entry: ['App', '/src/App.tsrx'] }),
			new ServerRoute({ path: '/__bench/trace', handler: traceResponse }),
			new ServerRoute({
				path: '/__bench/release-auth',
				methods: ['POST'],
				handler: releaseAuthorization,
			}),
		],
	},
});
