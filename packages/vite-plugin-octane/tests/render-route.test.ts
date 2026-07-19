import { describe, it, expect } from 'vitest';
import { handleRenderRoute } from '../src/server/render-route.js';
import { RenderRoute } from '../src/routes.js';

describe('dev SSR error page', () => {
	it('shows the module path, not the raw tuple, for a tuple-configured route', async () => {
		// A route using the [exportName, modulePath] tuple entry form.
		const route = new RenderRoute({ path: '/posts/:id', entry: ['Post', '/src/Post.tsrx'] });

		// Make the render throw so we get the 500 error page. ssrLoadModule is the
		// first thing handleRenderRoute awaits, so throwing here is enough.
		const vite = {
			ssrLoadModule: () => {
				throw new Error('boom');
			},
		};

		const response = await handleRenderRoute(route, {} as any, vite as any);
		expect(response.status).toBe(500);

		const html = await response.text();
		// Should show the module path, not the whole tuple joined as "Post,/src/Post.tsrx".
		expect(html).toContain('Route: /posts/:id → /src/Post.tsrx');
		expect(html).not.toContain('Post,/src/Post.tsrx');
	});
});
