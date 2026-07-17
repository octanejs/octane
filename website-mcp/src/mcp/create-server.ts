// The per-request server factory. Stateless Streamable HTTP creates a fresh
// McpServer for every POST (the SDK transport cannot be reused across requests
// in stateless mode), so construction must stay cheap: all knowledge lives in
// module-level constants built once per process at import time.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import octanePkg from '../../../packages/octane/package.json';
import { registerRemoteTools } from './tools.ts';
import { registerResources } from './resources.ts';

export function createMcpServer(): McpServer {
	// The version advertised to clients is the octane release this deployment's
	// knowledge was built from — more useful to an agent than an app version.
	const server = new McpServer({ name: 'octane', version: octanePkg.version });
	registerRemoteTools(server);
	registerResources(server);
	return server;
}
