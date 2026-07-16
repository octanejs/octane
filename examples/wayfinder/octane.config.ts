import {
	defineConfig,
	OCTANE_NONCE_STATE_KEY,
	RenderRoute,
	type Middleware,
} from '@octanejs/vite-plugin';
import { randomBytes } from 'node:crypto';

const cspMiddleware: Middleware = async (context, next) => {
	const nonce = randomBytes(24).toString('base64url');
	const contentSecurityPolicy = [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}'`,
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data:",
		"connect-src 'self' ws:",
		"font-src 'self'",
		"object-src 'none'",
		"base-uri 'none'",
		"frame-ancestors 'none'",
		"form-action 'self'",
	].join('; ');
	context.state.set(OCTANE_NONCE_STATE_KEY, nonce);
	const response = await next();
	const headers = new Headers(response.headers);
	headers.set('Content-Security-Policy', contentSecurityPolicy);
	headers.set('Referrer-Policy', 'same-origin');
	headers.set('X-Content-Type-Options', 'nosniff');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
};

const ENTRY = ['App', '/src/App.tsrx'] as const;

export default defineConfig({
	middlewares: [cspMiddleware],
	router: {
		preHydrate: '/src/pre-hydrate.ts',
		routes: [
			new RenderRoute({ path: '/', entry: ENTRY }),
			new RenderRoute({ path: '/trips/:tripId', entry: ENTRY }),
			new RenderRoute({ path: '/saved', entry: ENTRY }),
		],
	},
});
