import { defineConfig, RenderRoute, ServerRoute } from '@octanejs/vite-plugin';
import { traceResponse } from './src/backend.ts';

export default defineConfig({
	router: {
		preHydrate: '/src/pre-hydrate.ts',
		routes: [
			new RenderRoute({ path: '/', entry: ['App', '/src/App.tsrx'] }),
			new RenderRoute({ path: '/eager', entry: ['EagerApp', '/src/App.tsrx'] }),
			new ServerRoute({ path: '/__lab/trace', handler: traceResponse }),
		],
	},
});
