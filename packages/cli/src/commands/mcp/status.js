import path from 'node:path';
import { defineCommand } from '../../kernel/command.js';
import { detectClients } from './detect.js';
import { SERVER_NAME } from './server.js';

/** @type {import('./clients.js').Scope[]} */
const SCOPES = ['user', 'project'];

export default defineCommand({
	description: `Show which agents have the "${SERVER_NAME}" MCP server registered.`,

	async run(ctx) {
		const project = ctx.project();

		const rows = SCOPES.flatMap((scope) =>
			detectClients(ctx, scope, project.root).map((state) => ({
				client: state.client.id,
				label: state.client.label,
				scope,
				configured: state.server !== null,
				cliAvailable: state.cliAvailable,
				configPath: state.configPath,
				configExists: state.configExists,
			})),
		);

		ctx.ui.intro('octane mcp status');
		const width = rows.reduce((max, row) => Math.max(max, row.label.length), 0);

		for (const row of rows) {
			const mark = row.configured ? ctx.ui.colors.green('✔') : ctx.ui.colors.dim('○');
			const where = row.configExists ? path.normalize(row.configPath) : 'no config file';
			const detail = row.configured ? where : row.cliAvailable ? `installed, ${where}` : where;
			ctx.ui.log(
				`  ${mark} ${row.label.padEnd(width)}  ${row.scope.padEnd(7)} ${ctx.ui.colors.dim(detail)}`,
			);
		}

		const configured = rows.filter((row) => row.configured).length;
		ctx.ui.outro(
			configured === 0
				? 'Not registered anywhere yet. Run `octane mcp add`.'
				: `Registered in ${configured} place(s).`,
		);

		return { json: { server: SERVER_NAME, clients: rows } };
	},
});
