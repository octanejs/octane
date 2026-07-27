import { existsSync } from 'node:fs';
import path from 'node:path';
import { readJsonc } from '../../kernel/jsonc.js';

export const SERVER_NAME = 'octane';
export const SERVER_PACKAGE = '@octanejs/mcp-server';

/**
 * @typedef {Object} ServerEntry
 * @property {string} command
 * @property {string[]} args
 * @property {Record<string, string>} [env]
 */

/**
 * Walk up for an octane monorepo checkout.
 *
 * The MCP server registers its maintainer tools only when `OCTANE_REPO_ROOT`
 * points at a checkout, so installing from inside one should wire that up
 * rather than silently offering half the toolset.
 *
 * @param {string} from
 * @returns {string | null}
 */
export function findRepoRoot(from) {
	let dir = path.resolve(from);
	for (;;) {
		const manifest = path.join(dir, 'packages', 'octane', 'package.json');
		if (existsSync(manifest) && readJsonc(manifest)?.name === 'octane') return dir;
		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/**
 * @param {{ command?: string, repoRoot?: string | null }} [options]
 * @returns {ServerEntry}
 */
export function buildServerEntry({ command, repoRoot } = {}) {
	/** @type {ServerEntry} */
	const entry = command ? { command, args: [] } : { command: 'npx', args: ['-y', SERVER_PACKAGE] };

	if (repoRoot) entry.env = { OCTANE_REPO_ROOT: repoRoot };
	return entry;
}
