import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { CLIENTS, readConfigText } from './clients.js';
import { SERVER_NAME } from './server.js';

/**
 * Honour an overridden HOME so a test run can never read or write the real
 * `~/.claude.json`.
 *
 * @param {import('../../kernel/context.js').Ctx} ctx
 * @returns {string}
 */
export const resolveHome = (ctx) => ctx.env.HOME ?? ctx.env.USERPROFILE ?? homedir();

/**
 * @typedef {Object} ClientState
 * @property {import('./clients.js').Client} client
 * @property {import('./clients.js').Scope} scope
 * @property {string} configPath
 * @property {boolean} configExists
 * @property {boolean} cliAvailable
 * @property {unknown | null} server the octane entry already registered, if any
 */

/**
 * Inspect every known client for a given scope.
 *
 * A client counts as present when either its config file exists or its CLI is
 * on PATH, so a fresh install of a tool that has not written its config yet is
 * still offered.
 *
 * @param {import('../../kernel/context.js').Ctx} ctx
 * @param {import('./clients.js').Scope} scope
 * @param {string} projectRoot
 * @returns {ClientState[]}
 */
export function detectClients(ctx, scope, projectRoot) {
	const paths = { projectRoot, home: resolveHome(ctx) };

	return CLIENTS.filter((client) => client.scopes.includes(scope)).map((client) => {
		const configPath = client.configPath(scope, paths);
		const configExists = existsSync(configPath);
		return {
			client,
			scope,
			configPath,
			configExists,
			cliAvailable: Boolean(client.cli && ctx.exec.which(client.cli)),
			server: configExists ? client.readServer(readConfigText(configPath), SERVER_NAME) : null,
		};
	});
}

/**
 * @param {ClientState} state
 * @returns {boolean}
 */
export const isPresent = (state) => state.configExists || state.cliAvailable;
