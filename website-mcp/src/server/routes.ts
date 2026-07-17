// The machine-facing route table (everything except the landing RenderRoute).
// Handlers dynamically import their implementation modules so that loading
// this file — and therefore octane.config.ts — never pulls the MCP SDK, the
// octane compiler, or the docs snapshot into the config graph. The /v1 prefix
// is the API contract; a breaking revision mounts as a sibling /v2 table.
import { ServerRoute, type Context } from '@octanejs/vite-plugin';
import { cors } from './http.ts';

const rest = () => import('./rest.ts');

export const serverRoutes: ServerRoute[] = [
	new ServerRoute({
		path: '/v1/mcp',
		// OPTIONS must be listed for the router to hand CORS preflights to the
		// middleware instead of 404ing them.
		methods: ['POST', 'GET', 'DELETE', 'OPTIONS'],
		handler: async (context: Context) => (await import('./v1/mcp-route.ts')).handleMcp(context),
		before: [cors],
	}),
	new ServerRoute({
		path: '/v1/docs',
		methods: ['GET', 'OPTIONS'],
		handler: async () => (await rest()).getDocsIndex(),
		before: [cors],
	}),
	new ServerRoute({
		path: '/v1/docs/:slug',
		methods: ['GET', 'OPTIONS'],
		handler: async (context: Context) => (await rest()).getDoc(context),
		before: [cors],
	}),
	new ServerRoute({
		path: '/v1/bindings',
		methods: ['GET', 'OPTIONS'],
		handler: async () => (await rest()).getBindings(),
		before: [cors],
	}),
	new ServerRoute({
		path: '/llms.txt',
		methods: ['GET'],
		handler: async () => (await rest()).getLlmsTxt(),
	}),
	new ServerRoute({
		path: '/llms-full.txt',
		methods: ['GET'],
		handler: async () => (await rest()).getLlmsFullTxt(),
	}),
];
