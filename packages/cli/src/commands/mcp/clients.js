import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseJsonc } from '../../kernel/jsonc.js';

/**
 * @typedef {'user' | 'project'} Scope
 */

/**
 * @typedef {Object} Paths
 * @property {string} projectRoot
 * @property {string} home resolved from the environment, so tests never touch a
 *   real `~/.claude.json`
 */

/**
 * @typedef {Object} Client
 * @property {string} id
 * @property {string} label
 * @property {string | null} cli binary that owns this client's config, if any
 * @property {Scope[]} scopes
 * @property {(scope: Scope, paths: Paths) => string} configPath
 * @property {(name: string, entry: import('./server.js').ServerEntry, scope: Scope) => string[] | null} cliArgs
 * @property {(name: string, scope: Scope) => string[] | null} cliRemoveArgs
 * @property {(text: string, name: string) => unknown | null} readServer current entry, or null
 * @property {(text: string, name: string, entry: import('./server.js').ServerEntry) => string} write
 * @property {(text: string, name: string) => string} remove
 */

/**
 * Read a config file that may be missing, empty, or corrupt.
 *
 * All three happen in the wild: `~/.cursor/mcp.json` in particular is commonly
 * present but not valid JSON. Treating those as an empty document is what keeps
 * the merge from either crashing or silently discarding a real config.
 *
 * @param {string} file
 * @returns {string}
 */
export function readConfigText(file) {
	if (!existsSync(file)) return '';
	try {
		return readFileSync(file, 'utf8');
	} catch {
		return '';
	}
}

/**
 * @param {string} text
 * @returns {Record<string, any>}
 */
function parseObject(text) {
	if (text.trim() === '') return {};
	try {
		const parsed = parseJsonc(text);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? /** @type {Record<string, any>} */ (parsed)
			: {};
	} catch {
		return {};
	}
}

/**
 * Most clients store MCP servers in a JSON object under a single key. The only
 * differences are the file path, the key name, and whether servers can be
 * nested per project.
 *
 * @param {{
 *   id: string,
 *   label: string,
 *   cli?: string | null,
 *   scopes?: Scope[],
 *   key?: string,
 *   entry?: (entry: import('./server.js').ServerEntry) => object,
 *   configPath: (scope: Scope, paths: Paths) => string,
 *   cliArgs?: Client['cliArgs'],
 *   cliRemoveArgs?: Client['cliRemoveArgs'],
 * }} spec
 * @returns {Client}
 */
function jsonClient(spec) {
	const key = spec.key ?? 'mcpServers';
	const shape = spec.entry ?? ((entry) => entry);

	return {
		id: spec.id,
		label: spec.label,
		cli: spec.cli ?? null,
		scopes: spec.scopes ?? ['user', 'project'],
		configPath: spec.configPath,
		cliArgs: spec.cliArgs ?? (() => null),
		cliRemoveArgs: spec.cliRemoveArgs ?? (() => null),

		readServer(text, name) {
			return parseObject(text)[key]?.[name] ?? null;
		},

		write(text, name, entry) {
			const config = parseObject(text);
			config[key] = { ...config[key], [name]: shape(entry) };
			return `${JSON.stringify(config, null, 2)}\n`;
		},

		remove(text, name) {
			const config = parseObject(text);
			if (config[key]) delete config[key][name];
			return `${JSON.stringify(config, null, 2)}\n`;
		},
	};
}

/**
 * Replace or append a TOML table, without a TOML parser.
 *
 * The section boundary is unambiguous (a line starting with `[`), so a splice
 * preserves every unrelated key, comment, and ordering choice in the file. A
 * parse-and-reserialize round trip would not.
 *
 * @param {string} text
 * @param {string} header
 * @param {string[] | null} body null removes the section
 * @returns {string}
 */
export function spliceTomlSection(text, header, body) {
	const lines = text.split('\n');
	const start = lines.findIndex((line) => line.trim() === header);

	if (start === -1) {
		if (!body) return text;
		const prefix = text.trim() === '' ? '' : `${text.replace(/\n+$/, '')}\n\n`;
		return `${prefix}${header}\n${body.join('\n')}\n`;
	}

	const end = sectionEnd(lines, start);
	const before = lines.slice(0, start);
	const after = lines.slice(end);

	// Blank lines are trimmed only at the splice boundary. A global whitespace
	// pass would also reach inside a multi-line TOML string elsewhere in the
	// file, which is exactly the unrelated user data this splice exists to
	// leave alone.
	while (before.length > 0 && before[before.length - 1].trim() === '') before.pop();

	const separator = before.length > 0 ? [''] : [];
	const replacement = body ? [...separator, header, ...body] : [];
	const tail = after.length > 0 ? ['', ...after] : [''];

	return [...before, ...replacement, ...tail].join('\n');
}

/**
 * Index of the first line after the section starting at `start`.
 *
 * @param {string[]} lines
 * @param {number} start
 * @returns {number}
 */
function sectionEnd(lines, start) {
	let end = start + 1;
	while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
	return end;
}

/**
 * @param {string} value
 * @returns {string}
 */
const toml = (value) => JSON.stringify(String(value));

/** @type {Client} */
const codex = {
	id: 'codex',
	label: 'Codex',
	cli: 'codex',
	// Codex keeps MCP servers in one user-level config; it has no project scope.
	scopes: ['user'],
	configPath: (scope, paths) => path.join(paths.home, '.codex', 'config.toml'),

	cliArgs: (name, entry) => [
		'mcp',
		'add',
		...Object.entries(entry.env ?? {}).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
		name,
		'--',
		entry.command,
		...entry.args,
	],
	cliRemoveArgs: (name) => ['mcp', 'remove', name],

	readServer(text, name) {
		const lines = text.split('\n');
		const start = lines.findIndex((line) => line.trim() === `[mcp_servers.${name}]`);
		if (start === -1) return null;
		// Bounded to this section: an unbounded search would report a later
		// server's command as if it were ours.
		const body = lines.slice(start + 1, sectionEnd(lines, start)).join('\n');
		return { command: /^\s*command\s*=\s*"([^"]*)"/m.exec(body)?.[1] ?? null };
	},

	write(text, name, entry) {
		const body = [
			`command = ${toml(entry.command)}`,
			`args = [${entry.args.map(toml).join(', ')}]`,
		];
		const env = Object.entries(entry.env ?? {});
		if (env.length > 0) {
			body.push(`env = { ${env.map(([key, value]) => `${key} = ${toml(value)}`).join(', ')} }`);
		}
		return spliceTomlSection(text, `[mcp_servers.${name}]`, body);
	},

	remove: (text, name) => spliceTomlSection(text, `[mcp_servers.${name}]`, null),
};

/**
 * Every client the CLI knows how to configure.
 *
 * Adding one is a single entry here: the add/status/remove commands are generic
 * over this table.
 *
 * @type {Client[]}
 */
export const CLIENTS = [
	jsonClient({
		id: 'claude',
		label: 'Claude Code',
		cli: 'claude',
		// `project` is the committed .mcp.json the whole team shares; `user`
		// is the personal config. This mirrors `claude mcp add --scope`.
		configPath: (scope, paths) =>
			scope === 'project'
				? path.join(paths.projectRoot, '.mcp.json')
				: path.join(paths.home, '.claude.json'),
		// The name goes before `-e`: Claude declares `--env <env...>` as variadic,
		// so an `-e` ahead of the positional swallows the server name and the CLI
		// rejects it as a malformed environment variable.
		cliArgs: (name, entry, scope) => [
			'mcp',
			'add',
			'--scope',
			scope,
			name,
			...Object.entries(entry.env ?? {}).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
			'--',
			entry.command,
			...entry.args,
		],
		// Scope is forwarded: `claude mcp remove` without it removes from
		// whichever scope the entry happens to exist in, which need not be the
		// one `mcp remove --scope` just reported.
		cliRemoveArgs: (name, scope) => ['mcp', 'remove', '--scope', scope, name],
	}),
	codex,
	jsonClient({
		id: 'cursor',
		label: 'Cursor',
		configPath: (scope, paths) =>
			scope === 'project'
				? path.join(paths.projectRoot, '.cursor', 'mcp.json')
				: path.join(paths.home, '.cursor', 'mcp.json'),
	}),
	jsonClient({
		id: 'vscode',
		label: 'VS Code',
		// VS Code names the map `servers`, not `mcpServers`, and its schema
		// discriminates transports on `type`; without it the entry is rejected
		// and the server silently never registers.
		key: 'servers',
		entry: (entry) => ({ type: 'stdio', ...entry }),
		scopes: ['project'],
		configPath: (scope, paths) => path.join(paths.projectRoot, '.vscode', 'mcp.json'),
	}),
];

/**
 * @param {string} id
 * @returns {Client | undefined}
 */
export const findClient = (id) => CLIENTS.find((client) => client.id === id);
