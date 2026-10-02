import { defineConfig, RenderRoute, ServerRoute } from '@octanejs/vite-plugin';
import { traceResponse } from './src/backend.ts';

export default defineConfig({
	router: {
		preHydrate: '/src/pre-hydrate.ts',
		routes: [
			// The shell is static server output; only its independent islands activate.
			new RenderRoute({ path: '/', entry: ['App', '/src/App.tsrx'], hydrate: 'islands' }),
			new RenderRoute({ path: '/eager', entry: ['EagerApp', '/src/App.tsrx'], hydrate: 'islands' }),
			new ServerRoute({ path: '/__lab/trace', handler: traceResponse }),
		],
	},
});
