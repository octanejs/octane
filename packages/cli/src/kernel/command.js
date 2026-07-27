/**
 * @typedef {Object} CommandEntry
 * An index record. Name, aliases, and the one-line summary live here and
 * nowhere else, so `octane --help` can list every command without importing a
 * single command module.
 * @property {string} name
 * @property {string} summary
 * @property {string[]} [aliases]
 * @property {() => Promise<{ default: CommandModule }>} load
 */

/**
 * @typedef {Object} CommandModule
 * The behaviour half of a command. It never repeats its own name or summary.
 * @property {string} [description] long help, shown above the flag table
 * @property {Record<string, import('./args.js').FlagSpec>} [flags]
 * @property {import('./args.js').PositionalSpec[]} [positionals]
 * @property {CommandEntry[]} [subcommands]
 * @property {boolean} [requiresProject] refuse to run outside a package.json,
 *   for commands that write into one
 * @property {(ctx: import('./context.js').Ctx, input: CommandInput) => Promise<CommandResult>} [run]
 */

/**
 * @typedef {Object} CommandInput
 * @property {Record<string, any>} flags
 * @property {string[]} positionals
 * @property {string[]} rest
 */

/**
 * @typedef {void | number | { exitCode?: number, json?: unknown }} CommandResult
 * Human output is written through `ctx.ui` as the command runs. `json` is the
 * machine payload, printed by the kernel only under `--json`, so neither mode
 * has to know about the other.
 */

/**
 * Identity function that pins a module to the {@link CommandModule} shape.
 *
 * @param {CommandModule} command
 * @returns {CommandModule}
 */
export function defineCommand(command) {
	return command;
}

/**
 * @param {CommandEntry[]} entries
 * @param {string} name
 * @returns {CommandEntry | undefined}
 */
export function findEntry(entries, name) {
	return entries.find((entry) => entry.name === name || entry.aliases?.includes(name));
}

/**
 * Walk argv through nested command registries, loading only the modules that
 * are actually on the resolved path.
 *
 * @param {CommandEntry[]} entries
 * @param {string[]} argv
 * @returns {Promise<{ path: string[], module: CommandModule | null, argv: string[] }>}
 */
export async function resolveCommand(entries, argv) {
	/** @type {string[]} */
	const path = [];
	/** @type {CommandModule | null} */
	let module = null;
	let available = entries;
	let rest = argv;

	while (rest.length > 0) {
		const entry = rest[0].startsWith('-') ? undefined : findEntry(available, rest[0]);
		if (!entry) break;

		path.push(entry.name);
		rest = rest.slice(1);
		module = (await entry.load()).default;
		available = module.subcommands ?? [];
	}

	return { path, module, argv: rest };
}
