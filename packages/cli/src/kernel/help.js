import { GLOBAL_FLAGS } from './args.js';

/**
 * @param {string} name
 * @param {import('./args.js').FlagSpec} spec
 * @returns {string}
 */
function flagLabel(name, spec) {
	const short = spec.short ? `-${spec.short}, ` : '    ';
	const value = spec.type === 'boolean' ? '' : ` ${spec.placeholder ?? '<value>'}`;
	return `${short}--${name}${value}`;
}

/**
 * @param {[string, string][]} rows
 * @param {(text: string) => string} accent
 * @returns {string[]}
 */
function table(rows, accent) {
	const width = rows.reduce((max, [label]) => Math.max(max, label.length), 0);
	return rows.map(([label, description]) => `  ${accent(label.padEnd(width))}  ${description}`);
}

/**
 * Render help entirely from the command spec, so usage text cannot drift from
 * what the parser actually accepts.
 *
 * @param {{
 *   path: string[],
 *   module: import('./command.js').CommandModule | null,
 *   entries: import('./command.js').CommandEntry[],
 *   colors: { bold: (s: string) => string, dim: (s: string) => string, cyan: (s: string) => string },
 * }} input
 * @returns {string}
 */
export function renderHelp({ path, module, entries, colors }) {
	const invocation = ['octane', ...path].join(' ');
	const subcommands = module?.subcommands ?? (path.length === 0 ? entries : []);
	const positionals = module?.positionals ?? [];

	/** @type {string[]} */
	const lines = [];

	const argsUsage = positionals
		.map((p) => (p.required ? `<${p.name}>` : `[${p.name}]`) + (p.variadic ? '...' : ''))
		.join(' ');

	lines.push(colors.bold('Usage'));
	lines.push(
		`  ${invocation}${subcommands.length > 0 ? ' <command>' : ''}${argsUsage ? ` ${argsUsage}` : ''} [options]`,
	);

	if (module?.description) {
		lines.push('', module.description);
	}

	if (subcommands.length > 0) {
		lines.push('', colors.bold('Commands'));
		lines.push(
			...table(
				subcommands.map((entry) => [entry.name, entry.summary]),
				colors.cyan,
			),
		);
	}

	if (positionals.length > 0) {
		lines.push('', colors.bold('Arguments'));
		lines.push(
			...table(
				positionals.map((p) => [p.name, p.description]),
				colors.cyan,
			),
		);
	}

	const own = Object.entries(module?.flags ?? {});
	if (own.length > 0) {
		lines.push('', colors.bold('Options'));
		lines.push(
			...table(
				own.map(([name, spec]) => [flagLabel(name, spec), spec.description]),
				colors.cyan,
			),
		);
	}

	lines.push('', colors.bold('Global options'));
	lines.push(
		...table(
			Object.entries(GLOBAL_FLAGS).map(([name, spec]) => [flagLabel(name, spec), spec.description]),
			colors.dim,
		),
	);

	return lines.join('\n');
}
