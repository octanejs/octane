import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineCommand } from '../../kernel/command.js';
import { CliError, EXIT, usageError } from '../../kernel/errors.js';
import { CLIENTS, findClient, readConfigText } from './clients.js';
import { detectClients, isPresent } from './detect.js';
import { SERVER_NAME, SERVER_PACKAGE, buildServerEntry, findRepoRoot } from './server.js';

/**
 * @typedef {Object} Outcome
 * @property {string} client
 * @property {string} scope
 * @property {'cli' | 'file'} method
 * @property {string} target
 * @property {'added' | 'updated' | 'unchanged' | 'skipped' | 'failed'} status
 * @property {string} message
 */

/**
 * Install by handing the work to the client's own CLI, which owns its config
 * schema and can change it without telling us.
 *
 * @param {import('../../kernel/context.js').Ctx} ctx
 * @param {import('./detect.js').ClientState} state
 * @param {import('./server.js').ServerEntry} entry
 * @returns {Promise<Outcome | null>} null when the CLI route is unavailable
 */
async function installViaCli(ctx, state, entry) {
	const { client } = state;
	const args =
		client.cli && state.cliAvailable ? client.cliArgs(SERVER_NAME, entry, state.scope) : null;
	if (!client.cli || !args) return null;

	const result = await ctx.exec.run(client.cli, args, { cwd: ctx.cwd });
	const base = {
		client: client.id,
		scope: state.scope,
		method: /** @type {const} */ ('cli'),
		target: client.cli,
	};

	if (result.code !== 0) {
		return {
			...base,
			status: 'failed',
			message:
				(result.stderr || result.stdout).trim() || `${client.cli} exited with ${result.code}`,
		};
	}
	return {
		...base,
		status: state.server ? 'updated' : 'added',
		message: `${client.cli} ${args.join(' ')}`,
	};
}

/**
 * @param {import('../../kernel/context.js').Ctx} ctx
 * @param {import('./detect.js').ClientState} state
 * @param {import('./server.js').ServerEntry} entry
 * @returns {Outcome}
 */
function installViaFile(ctx, state, entry) {
	const { client, configPath } = state;
	const current = readConfigText(configPath);
	const next = client.write(current, SERVER_NAME, entry);
	const base = {
		client: client.id,
		scope: state.scope,
		method: /** @type {const} */ ('file'),
		target: configPath,
	};

	if (next === current) return { ...base, status: 'unchanged', message: 'Already up to date' };

	mkdirSync(path.dirname(configPath), { recursive: true });
	// Back up anything that was already there. These files hold the user's other
	// servers and, for Claude Code, unrelated state.
	if (current !== '') copyFileSync(configPath, `${configPath}.octane-backup`);
	writeFileSync(configPath, next);

	return {
		...base,
		status: state.server ? 'updated' : 'added',
		message:
			current === '' ? 'Created' : `Merged (backup at ${path.basename(configPath)}.octane-backup)`,
	};
}

export default defineCommand({
	description:
		`Register the Octane MCP server (${SERVER_PACKAGE}) with a coding agent, so it can\n` +
		'reach the Octane skills, bindings data, and React-to-Octane bridging tools.',
	positionals: [
		{
			name: 'client',
			description: `Clients to configure: ${CLIENTS.map((c) => c.id).join(', ')}. Defaults to every detected client.`,
			variadic: true,
		},
	],
	flags: {
		scope: {
			type: 'string',
			choices: ['user', 'project'],
			default: 'user',
			placeholder: '<scope>',
			description: 'Install for this user, or into this project so the team shares it.',
		},
		command: {
			type: 'string',
			placeholder: '<bin>',
			description: `Run the server this way instead of \`npx -y ${SERVER_PACKAGE}\`.`,
		},
		force: { type: 'boolean', description: 'Overwrite an existing octane entry without asking.' },
	},

	async run(ctx, input) {
		const scope = /** @type {import('./clients.js').Scope} */ (input.flags.scope);
		const project = ctx.project();
		const detected = detectClients(ctx, scope, project.root);

		const selected =
			input.positionals.length > 0
				? resolveRequested(input.positionals, detected)
				: await chooseClients(ctx, detected);

		if (selected.length === 0) throw new CliError('No clients selected.');

		const repoRoot = findRepoRoot(ctx.cwd);
		const entry = buildServerEntry({ command: input.flags.command, repoRoot });

		ctx.ui.intro('octane mcp add');
		if (repoRoot)
			ctx.ui.log(ctx.ui.colors.dim(`Detected an Octane checkout: OCTANE_REPO_ROOT=${repoRoot}`));

		if (ctx.dryRun) {
			for (const state of selected) {
				ctx.ui.note(`${state.client.label} (${scope})`, [
					state.cliAvailable && state.client.cli
						? `would run: ${state.client.cli} ${state.client.cliArgs(SERVER_NAME, entry, scope)?.join(' ')}`
						: `would write: ${state.configPath}`,
					...JSON.stringify({ [SERVER_NAME]: entry }, null, 2).split('\n'),
				]);
			}
			return { json: { ok: true, dryRun: true, clients: selected.map((s) => s.client.id) } };
		}

		/** @type {Outcome[]} */
		const outcomes = [];
		for (const state of selected) {
			const existing = state.server && !input.flags.force;
			if (existing) {
				const replace = await ctx.ui.confirm({
					message: `${state.client.label} already has an "${SERVER_NAME}" server. Replace it?`,
					flag: '--force',
					initial: false,
				});
				if (!replace) {
					const viaCli = state.cliAvailable && state.client.cli;
					outcomes.push({
						client: state.client.id,
						scope,
						method: viaCli ? 'cli' : 'file',
						target: viaCli ? /** @type {string} */ (state.client.cli) : state.configPath,
						status: 'skipped',
						message: 'Left the existing entry in place',
					});
					continue;
				}
			}
			outcomes.push((await installViaCli(ctx, state, entry)) ?? installViaFile(ctx, state, entry));
		}

		for (const outcome of outcomes) {
			const failed = outcome.status === 'failed';
			const mark = failed ? ctx.ui.colors.red('✖') : ctx.ui.colors.green('✔');
			ctx.ui.log(
				`  ${mark} ${outcome.client} (${outcome.scope}) ${ctx.ui.colors.dim(outcome.message)}`,
			);
		}
		ctx.ui.outro('Restart the agent to pick up the new server.');

		const ok = outcomes.every((outcome) => outcome.status !== 'failed');
		return { exitCode: ok ? EXIT.OK : EXIT.FAILURE, json: { ok, server: entry, outcomes } };
	},
});

/**
 * @param {string[]} ids
 * @param {import('./detect.js').ClientState[]} detected
 * @returns {import('./detect.js').ClientState[]}
 */
function resolveRequested(ids, detected) {
	return ids.map((id) => {
		if (!findClient(id)) {
			throw usageError(
				`Unknown client: ${id}`,
				`Known clients: ${CLIENTS.map((c) => c.id).join(', ')}.`,
			);
		}
		const state = detected.find((candidate) => candidate.client.id === id);
		if (!state) {
			throw usageError(
				`${id} does not support --scope ${detected[0]?.scope ?? 'this scope'}.`,
				`${id} supports: ${findClient(id)?.scopes.join(', ')}.`,
			);
		}
		return state;
	});
}

/**
 * @param {import('../../kernel/context.js').Ctx} ctx
 * @param {import('./detect.js').ClientState[]} detected
 * @returns {Promise<import('./detect.js').ClientState[]>}
 */
async function chooseClients(ctx, detected) {
	const present = detected.filter(isPresent);
	if (present.length === 0) {
		throw new CliError('No supported agent found on this machine.', {
			hint: `Name one explicitly: octane mcp add ${CLIENTS.map((c) => c.id).join('|')}`,
		});
	}

	const chosen = await ctx.ui.multiselect({
		message: 'Which agents should get the Octane MCP server?',
		flag: '<client>',
		initial: present.map((state) => state.client.id),
		options: present.map((state) => ({
			value: state.client.id,
			label: state.client.label,
			hint: state.server
				? 'already configured'
				: state.cliAvailable
					? 'via its CLI'
					: state.configPath,
		})),
	});

	return present.filter((state) => chosen.includes(state.client.id));
}
