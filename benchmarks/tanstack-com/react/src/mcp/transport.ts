import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer, type McpAuthContext } from './server';
import { validateMcpAuth, checkRateLimit, cleanupRateLimits } from './auth.server';
import { initSentryServer } from '~/utils/sentry.server';
import { validateContentLength } from '~/utils/api-boundary.server';

const MAX_MCP_REQUEST_BYTES = 128 * 1024;

/**
 * Create a JSON-RPC error response
 */
function jsonRpcError(
	code: number,
	message: string,
	httpStatus: number,
	headers?: Record<string, string>,
): Response {
	return new Response(
		JSON.stringify({
			jsonrpc: '2.0',
			error: { code, message },
			id: null,
		}),
		{
			status: httpStatus,
			headers: {
				'Content-Type': 'application/json',
				...headers,
			},
		},
	);
}

export async function handleMcpRequest(request: Request): Promise<Response> {
	// Initialize Sentry once per request
	initSentryServer();

	const contentLengthError = validateContentLength(request, MAX_MCP_REQUEST_BYTES);
	if (contentLengthError) {
		return jsonRpcError(-32600, contentLengthError.message, contentLengthError.status);
	}

	// Validate auth
	const authHeader = request.headers.get('Authorization');

	if (!authHeader) {
		return jsonRpcError(
			-32001,
			'Authentication required. Get an API key at https://tanstack.com/account/api-keys',
			401,
		);
	}

	const authResult = await validateMcpAuth(authHeader);

	if (!authResult.success) {
		return jsonRpcError(-32001, authResult.error, authResult.status);
	}

	const authContext: McpAuthContext = {
		userId: authResult.userId,
		keyId: authResult.keyId,
	};

	if (request.method === 'GET') {
		return jsonRpcError(
			-32000,
			'SSE streams are not supported by this stateless MCP endpoint. Send JSON-RPC requests with POST.',
			405,
			{
				Allow: 'POST, DELETE',
				'Cache-Control': 'no-store',
			},
		);
	}

	if (request.method !== 'DELETE') {
		const contentType = request.headers.get('content-type') || '';
		if (!contentType.toLowerCase().includes('application/json')) {
			return jsonRpcError(-32600, 'Expected application/json request body', 415);
		}
	}

	// Check rate limit
	const rateLimit = await checkRateLimit(
		authResult.keyId,
		'api_key',
		authResult.rateLimitPerMinute,
	);

	if (!rateLimit.allowed) {
		return jsonRpcError(-32002, 'Rate limit exceeded', 429, {
			'X-RateLimit-Limit': authResult.rateLimitPerMinute.toString(),
			'X-RateLimit-Remaining': '0',
			'X-RateLimit-Reset': Math.floor(rateLimit.resetAt.getTime() / 1000).toString(),
			'Retry-After': Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000).toString(),
		});
	}

	// Periodically cleanup old rate limit records (1% chance per request)
	if (Math.random() < 0.01) {
		cleanupRateLimits().catch(() => {});
	}

	// Create a new server and transport for each request (stateless serverless mode)
	const server = createMcpServer(authContext);

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined, // Stateless mode - no sessions
		enableJsonResponse: true, // Use JSON responses for simpler serverless handling
	});

	// Connect the server to the transport
	await server.connect(transport);

	try {
		// Handle the request
		const response = await transport.handleRequest(request);

		// Add rate limit headers to successful responses
		const headers = new Headers(response.headers);
		headers.set('X-RateLimit-Limit', authResult.rateLimitPerMinute.toString());
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	} catch (error) {
		console.error('[MCP] Request failed:', error);
		// Return error response for unhandled errors
		return jsonRpcError(-32603, 'Internal error', 500);
	}
}
