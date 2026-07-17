// The ServerRoute ↔ MCP bridge: stateless Streamable HTTP. Every POST gets a
// FRESH transport + McpServer pair — the SDK transport throws if reused across
// requests in stateless mode, and a fresh pair is exactly what a serverless
// function wants anyway (no session affinity between invocations).
import type { Context } from '@octanejs/vite-plugin';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from '../../mcp/create-server.ts';
import { methodNotAllowed } from '../http.ts';

export async function handleMcp(context: Context): Promise<Response> {
	const { request } = context;
	// Stateless: a GET would open a server-push SSE stream that nothing will
	// ever write to (and that never closes — it would pin the serverless
	// function), and there is no session for DELETE to terminate. The spec
	// allows 405 for servers that offer no server-initiated stream.
	if (request.method !== 'POST') {
		return methodNotAllowed('POST');
	}
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined, // stateless
		// Buffered JSON responses instead of SSE: every tool here resolves
		// promptly, and a plain application/json body avoids holding the
		// function open on a stream.
		enableJsonResponse: true,
	});
	const server = createMcpServer();
	await server.connect(transport);
	return transport.handleRequest(request);
}
