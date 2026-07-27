import { defineCommand } from '../../kernel/command.js';
import { SERVER_PACKAGE } from './server.js';

export default defineCommand({
	description: `Manage the Octane MCP server (${SERVER_PACKAGE}) across coding agents.`,
	subcommands: [
		{
			name: 'add',
			summary: 'Register the Octane MCP server with an agent.',
			load: () => import('./add.js'),
		},
		{
			name: 'status',
			summary: 'Show where the Octane MCP server is registered.',
			load: () => import('./status.js'),
		},
		{
			name: 'remove',
			summary: 'Remove the Octane MCP server from an agent.',
			load: () => import('./remove.js'),
		},
	],
});
