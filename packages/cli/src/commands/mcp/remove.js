import { copyFileSync, writeFileSync } from 'node:fs';
import { defineCommand } from '../../kernel/command.js';
import { EXIT } from '../../kernel/errors.js';
import { CLIENTS, readConfigText } from './clients.js';
import { detectClients } from './detect.js';
import { SERVER_NAME } from './server.js';

export default defineCommand({
	description: `Remove the "${SERVER_NAME}" MCP server from one or more agents.`,
	positionals: [
		{
			name: 'client',
			description: `Clients to clean up: ${CLIENTS.map((c) => c.id).join(', ')}. Defaults to every configured client.`,
			variadic: true,
		},
	],
	flags: {
		scope: {
			type: 'string',
			choices: ['user', 'project'],
			default: 'user',
			placeholder: '<scope>',
			description: 'Which installation to remove.',
		},
	},

	async run(ctx, input) {
		const scope = /** @type {import('./clients.js').Scope} */ (input.flags.scope);
		const project = ctx.project();

		const configured = detectClients(ctx, scope, project.root).filter(
			(state) =>
				state.server !== null &&
				(input.positionals.length === 0 || input.positionals.includes(state.client.id)),
		);

		ctx.ui.intro('octane mcp remove');

		if (configured.length === 0) {
			ctx.ui.outro(`No ${scope}-scope client has an "${SERVER_NAME}" server.`);
			return { json: { ok: true, removed: [] } };
		}

		if (ctx.dryRun) {
			for (const state of configured) {
				const args = state.cliAvailable ? state.client.cliRemoveArgs(SERVER_NAME, scope) : null;
				ctx.ui.note(`${state.client.label} (${scope})`, [
					args
						? `would run: ${state.client.cli} ${args.join(' ')}`
						: `would rewrite: ${state.configPath}`,
				]);
			}
			return {
				json: { ok: true, dryRun: true, removed: configured.map((state) => state.client.id) },
			};
		}

		const confirmed = await ctx.ui.confirm({
			message: `Remove "${SERVER_NAME}" from ${configured.map((s) => s.client.label).join(', ')}?`,
			flag: '--yes',
			initial: true,
		});
		if (!confirmed) return { exitCode: EXIT.OK, json: { ok: true, removed: [] } };

		/** @type {{ client: string, method: string, target: string, ok: boolean, message: string }[]} */
		const removed = [];

		for (const state of configured) {
			const { client } = state;
			const args =
				client.cli && state.cliAvailable ? client.cliRemoveArgs(SERVER_NAME, scope) : null;

			if (client.cli && args) {
				const result = await ctx.exec.run(client.cli, args, { cwd: ctx.cwd });
				removed.push({
					client: client.id,
					method: 'cli',
					target: client.cli,
					ok: result.code === 0,
					message: result.code === 0 ? 'Removed' : (result.stderr || result.stdout).trim(),
				});
				continue;
			}

			const current = readConfigText(state.configPath);
			copyFileSync(state.configPath, `${state.configPath}.octane-backup`);
			writeFileSync(state.configPath, client.remove(current, SERVER_NAME));
			removed.push({
				client: client.id,
				method: 'file',
				target: state.configPath,
				ok: true,
				message: 'Removed',
			});
		}

		for (const entry of removed) {
			const mark = entry.ok ? ctx.ui.colors.green('✔') : ctx.ui.colors.red('✖');
			ctx.ui.log(`  ${mark} ${entry.client} ${ctx.ui.colors.dim(entry.message)}`);
		}

		const ok = removed.every((entry) => entry.ok);
		return { exitCode: ok ? EXIT.OK : EXIT.FAILURE, json: { ok, removed } };
	},
});
