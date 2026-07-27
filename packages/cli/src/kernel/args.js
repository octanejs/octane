import { usageError } from './errors.js';

/**
 * @typedef {Object} FlagSpec
 * @property {'boolean' | 'string' | 'number'} type
 * @property {string} description
 * @property {string} [short] single character alias, without the dash
 * @property {unknown} [default]
 * @property {readonly string[]} [choices]
 * @property {boolean} [repeatable] collect every occurrence into an array
 * @property {string} [placeholder] value name shown in help, e.g. `<dir>`
 */

/**
 * @typedef {Object} PositionalSpec
 * @property {string} name
 * @property {string} description
 * @property {boolean} [required] documentation only; commands enforce it
 *   themselves so that an interactive session can prompt for the value instead
 * @property {boolean} [variadic]
 */

/**
 * @typedef {Object} ParsedArgs
 * @property {Record<string, unknown>} flags
 * @property {string[]} positionals
 * @property {string[]} rest tokens after a bare `--`
 */

/**
 * Flags every command accepts. Merged into each command's own spec so that
 * parsing, validation, and help all see one flat table.
 *
 * @type {Record<string, FlagSpec>}
 */
export const GLOBAL_FLAGS = {
	help: { type: 'boolean', short: 'h', description: 'Show help for this command.' },
	version: { type: 'boolean', short: 'v', description: 'Print the CLI version.' },
	json: { type: 'boolean', description: 'Emit a single JSON result and no human output.' },
	cwd: { type: 'string', placeholder: '<dir>', description: 'Run against a different directory.' },
	yes: { type: 'boolean', short: 'y', description: 'Accept every prompt with its default.' },
	'dry-run': { type: 'boolean', description: 'Report what would change without writing.' },
	color: { type: 'boolean', default: true, description: 'Colorize output (--no-color disables).' },
	verbose: { type: 'boolean', description: 'Include diagnostic detail in output.' },
};

/**
 * @param {FlagSpec} spec
 * @param {string} name
 * @param {string} raw
 * @returns {unknown}
 */
function coerce(spec, name, raw) {
	if (spec.type === 'number') {
		const value = Number(raw);
		if (!Number.isFinite(value)) throw usageError(`--${name} expects a number, got "${raw}".`);
		return value;
	}
	if (spec.type === 'boolean') {
		if (raw === 'true') return true;
		if (raw === 'false') return false;
		throw usageError(`--${name} expects true or false, got "${raw}".`);
	}
	if (spec.choices && !spec.choices.includes(raw)) {
		throw usageError(`--${name} expects one of: ${spec.choices.join(', ')}. Got "${raw}".`);
	}
	return raw;
}

/**
 * @param {Record<string, FlagSpec>} specs
 * @returns {Map<string, string>}
 */
function shortIndex(specs) {
	const index = new Map();
	for (const [name, spec] of Object.entries(specs)) {
		if (spec.short) index.set(spec.short, name);
	}
	return index;
}

/**
 * Parse argv against a flag/positional spec.
 *
 * Supports `--name`, `--name=value`, `--name value`, `--no-name` for booleans,
 * `-x` short aliases, and a bare `--` terminator. An unrecognized flag is a
 * usage error rather than a silently ignored token, because a typo'd flag that
 * parses as a positional is the worst possible failure mode for a `--fix`-style
 * command.
 *
 * @param {string[]} argv
 * @param {{ flags?: Record<string, FlagSpec>, positionals?: PositionalSpec[] }} spec
 * @returns {ParsedArgs}
 */
export function parseArgs(argv, spec = {}) {
	const specs = { ...GLOBAL_FLAGS, ...(spec.flags ?? {}) };
	const shorts = shortIndex(specs);

	/** @type {Record<string, unknown>} */
	const flags = {};
	/** @type {string[]} */
	const positionals = [];
	/** @type {string[]} */
	let rest = [];

	for (const [name, entry] of Object.entries(specs)) {
		if (entry.default !== undefined) flags[name] = entry.default;
		else if (entry.repeatable) flags[name] = [];
	}

	/**
	 * @param {string} name
	 * @param {unknown} value
	 */
	const assign = (name, value) => {
		const entry = specs[name];
		if (entry.repeatable) {
			const list = Array.isArray(flags[name]) ? /** @type {unknown[]} */ (flags[name]) : [];
			list.push(value);
			flags[name] = list;
		} else {
			flags[name] = value;
		}
	};

	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];

		if (token === '--') {
			rest = argv.slice(i + 1);
			break;
		}

		if (!token.startsWith('-') || token === '-') {
			positionals.push(token);
			continue;
		}

		const isLong = token.startsWith('--');
		const body = isLong ? token.slice(2) : token.slice(1);
		const eq = body.indexOf('=');
		const key = eq === -1 ? body : body.slice(0, eq);
		const inline = eq === -1 ? undefined : body.slice(eq + 1);

		let name = (isLong ? key : shorts.get(key)) ?? '';
		let negated = false;

		if (isLong && !specs[name] && key.startsWith('no-') && specs[key.slice(3)]) {
			name = key.slice(3);
			negated = true;
		}

		const entry = specs[name];
		if (!entry) throw usageError(`Unknown flag: ${token}`, 'Run with --help to see valid flags.');

		if (negated) {
			if (entry.type !== 'boolean') throw usageError(`--no-${name} is only valid for flags.`);
			assign(name, false);
			continue;
		}

		if (inline !== undefined) {
			assign(name, coerce(entry, name, inline));
			continue;
		}

		if (entry.type === 'boolean') {
			assign(name, true);
			continue;
		}

		const next = argv[i + 1];
		if (next === undefined || (next.startsWith('-') && next !== '-')) {
			throw usageError(`--${name} expects a value.`);
		}
		assign(name, coerce(entry, name, next));
		i++;
	}

	return { flags, positionals, rest };
}
