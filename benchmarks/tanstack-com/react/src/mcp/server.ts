import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { withSentrySpan, captureException } from '~/utils/sentry.server';
import { npmStats, npmStatsSchema } from './tools/npm-stats';
import { env } from '~/utils/env';

export type McpAuthContext = {
	userId: string;
	keyId: string;
};

type ToolResult = {
	content: Array<{ type: 'text'; text: string }>;
	isError?: boolean;
};

type ToolHandler<TArgs> = (args: TArgs) => Promise<ToolResult>;

function jsonResult(data: unknown): ToolResult {
	return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function errorResult(error: unknown): ToolResult {
	const message = error instanceof Error ? error.message : 'Unknown error';
	return {
		content: [{ type: 'text', text: `Error: ${message}` }],
		isError: true,
	};
}

function withToolMonitoring<TArgs>(
	toolName: string,
	handler: ToolHandler<TArgs>,
	authContext?: McpAuthContext,
): ToolHandler<TArgs> {
	return async (args: TArgs) => {
		try {
			return await withSentrySpan(`mcp.${toolName}`, 'mcp.tool', () => handler(args));
		} catch (error) {
			const caughtError = error instanceof Error ? error : new Error(String(error));

			captureException(caughtError, { toolName, userId: authContext?.userId });
			throw error;
		}
	};
}

// Tools that require authentication live here on tanstack.com
// Documentation tools have moved to @tanstack/cli - run `npx @tanstack/cli mcp` or `tanstack mcp`
export const ALL_TOOL_NAMES = ['npm_stats'] as const;

export type ToolName = (typeof ALL_TOOL_NAMES)[number];

function getEnabledTools(): Set<ToolName> | undefined {
	const envVar = env.TANSTACK_MCP_ENABLED_TOOLS;
	if (!envVar) return undefined;

	const validTools = new Set<ToolName>();
	const invalidTools: Array<string> = [];

	for (const tool of envVar
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean)) {
		if (ALL_TOOL_NAMES.includes(tool as ToolName)) {
			validTools.add(tool as ToolName);
		} else {
			invalidTools.push(tool);
		}
	}

	if (invalidTools.length > 0) {
		console.warn(
			`[MCP] Invalid tools: ${invalidTools.join(', ')}. Valid: ${ALL_TOOL_NAMES.join(', ')}`,
		);
	}

	return validTools;
}

const SERVER_INSTRUCTIONS = `TanStack MCP Server (tanstack.com)

IMPORTANT: Most TanStack MCP tools have moved to @tanstack/cli for better local development experience.

To use the full TanStack MCP toolkit, run:
  npx @tanstack/cli mcp

Or if installed globally:
  tanstack mcp

The CLI provides these tools:
- tanstack_list_libraries: List TanStack libraries with metadata
- tanstack_doc: Fetch documentation pages
- tanstack_search_docs: Search documentation via Algolia
- tanstack_ecosystem: Browse ecosystem partners
- listTanStackIntegrations: List available project integrations
- createTanStackApplication: Create new TanStack Start projects

This server (tanstack.com) provides authenticated tools:
- npm_stats: NPM download statistics (requires API key)`;

export function createMcpServer(authContext?: McpAuthContext) {
	const server = new McpServer(
		{ name: 'tanstack', version: '1.0.0' },
		{ instructions: SERVER_INSTRUCTIONS },
	);
	const enabledTools = getEnabledTools();

	const isEnabled = (name: ToolName) => !enabledTools || enabledTools.has(name);

	if (isEnabled('npm_stats')) {
		server.tool(
			'npm_stats',
			'NPM download statistics. Org summary (default), library breakdown, or package comparison.',
			npmStatsSchema.shape,
			withToolMonitoring(
				'npm_stats',
				async (args) => {
					try {
						return jsonResult(await npmStats(npmStatsSchema.parse(args)));
					} catch (error) {
						return errorResult(error);
					}
				},
				authContext,
			),
		);
	}

	return server;
}
