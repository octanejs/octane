/**
 * The root command table.
 *
 * Adding a command is one directory under `src/commands/` plus one entry here.
 * The list is static so it stays greppable and cannot drift out of sync with
 * the help output, while `load` keeps every command module off the startup
 * path until it is the one being run.
 *
 * @type {import('./command.js').CommandEntry[]}
 */
export const COMMANDS = [
	{
		name: 'create',
		summary: 'Create an Octane app in a new directory.',
		load: () => import('../commands/create.js'),
	},
	{
		name: 'init',
		summary: 'Wire Octane into the project in this directory.',
		load: () => import('../commands/init/index.js'),
	},
	{
		name: 'doctor',
		summary: 'Diagnose an Octane project and optionally repair it.',
		load: () => import('../commands/doctor/index.js'),
	},
	{
		name: 'analyze',
		summary: 'Compile the project and report the Octane compiler diagnostics.',
		load: () => import('../commands/analyze.js'),
	},
	{
		name: 'info',
		summary: 'Print environment and project details for a bug report.',
		load: () => import('../commands/info.js'),
	},
	{
		name: 'add',
		summary: 'Install an Octane binding and report how it differs from upstream.',
		load: () => import('../commands/add.js'),
	},
	{
		name: 'bindings',
		summary: 'List and search the @octanejs/* bindings.',
		load: () => import('../commands/bindings.js'),
	},
	{
		name: 'explain',
		summary: 'Explain an Octane runtime error code.',
		load: () => import('../commands/explain.js'),
	},
	{
		name: 'mcp',
		summary: 'Register the Octane MCP server with Claude Code, Codex, Cursor, or VS Code.',
		load: () => import('../commands/mcp/index.js'),
	},
];
