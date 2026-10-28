#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import colors from 'picocolors';
import { runCodemod } from './project.js';

const HELP = `octane-codemod — migrate React + TSX/JSX to Octane + TSRX

Usage: octane-codemod [paths...] [options]

  paths              files or directories to migrate (default: .)

Options:
  --strong           make each migrated module Strong where the compiler
                     accepts it; the rest stay in compatibility mode
  --force-strong     keep "use strong" even where Strong errors remain
  --target <tsrx|tsx> tsrx (default) rewrites components as templates;
                     tsx keeps JSX and only ports the React APIs
  --dry-run          report without writing
  --print            print each migrated module (implies --dry-run)
  --no-verify        skip compiling the result
  --json             print the result as JSON
  -h, --help         show this help
`;

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		strong: { type: 'boolean', default: false },
		'force-strong': { type: 'boolean', default: false },
		target: { type: 'string', default: 'tsrx' },
		'dry-run': { type: 'boolean', default: false },
		print: { type: 'boolean', default: false },
		verify: { type: 'boolean', default: true },
		'no-verify': { type: 'boolean', default: false },
		json: { type: 'boolean', default: false },
		help: { type: 'boolean', short: 'h', default: false },
	},
});

if (values.help) {
	process.stdout.write(HELP);
	process.exit(0);
}
if (values.target !== 'tsrx' && values.target !== 'tsx') {
	process.stderr.write(`--target must be tsrx or tsx, got "${values.target}".\n`);
	process.exit(2);
}

const result = await runCodemod(positionals.length > 0 ? positionals : ['.'], {
	target: /** @type {'tsrx' | 'tsx'} */ (values.target),
	strong: values.strong || values['force-strong'],
	forceStrong: values['force-strong'],
	verify: values.verify && !values['no-verify'],
	write: !values['dry-run'] && !values.print,
});

if (values.json) {
	process.stdout.write(
		JSON.stringify(
			{
				...result,
				files: result.files.map(({ code, ...file }) => (values.print ? { ...file, code } : file)),
			},
			null,
			2,
		) + '\n',
	);
	process.exit(exitCode(result));
}

const changed = result.files.filter((file) => file.changed);
const renamed = changed.filter((file) => file.output !== file.file);
for (const file of changed) {
	const arrow = file.output === file.file ? '' : ` → ${file.output}`;
	const rules = Object.entries(file.rules)
		.map(([rule, count]) => (count > 1 ? `${rule}×${count}` : rule))
		.join(', ');
	const strong =
		file.strong === true
			? colors.green(' strong')
			: file.strong === false
				? colors.yellow(' compat')
				: '';
	const errors =
		file.diagnostics.filter((d) => d.severity === 'error').length +
		file.notes.filter((n) => n.severity === 'error').length;
	const mark = errors > 0 ? colors.red('✗') : colors.green('✓');
	process.stdout.write(`${mark} ${file.file}${arrow}${strong}  ${colors.dim(rules)}\n`);
	if (values.print) process.stdout.write(colors.dim('─'.repeat(60)) + '\n' + file.code + '\n');
}

const attention = changed.flatMap((file) => [
	...file.notes
		.filter((note) => note.severity !== 'info')
		.map((note) => ({
			file: file.output,
			line: note.line,
			severity: note.severity,
			code: note.rule,
			message: note.message,
		})),
	...file.diagnostics.map((d) => ({
		file: file.output,
		line: d.line,
		severity: d.severity,
		code: d.code,
		message: d.message,
	})),
]);
if (attention.length > 0) {
	process.stdout.write(`\n${colors.bold('Needs attention')}\n`);
	for (const item of attention) {
		const tag =
			item.severity === 'error' ? colors.red(item.severity) : colors.yellow(item.severity);
		process.stdout.write(
			`  ${item.file}:${item.line} ${tag} ${colors.dim(item.code)} ${item.message.split('\n')[0]}\n`,
		);
	}
}
if (result.packages.length > 0) {
	process.stdout.write(`\n${colors.bold('Dependencies')}\n`);
	for (const { from, to } of result.packages) process.stdout.write(`  ${from} → ${to}\n`);
}
for (const page of result.html) process.stdout.write(`\nUpdated the entry script in ${page}\n`);

const strongFiles = changed.filter((file) => file.strong !== null);
const summary = [
	`${changed.length} module(s) migrated`,
	`${renamed.length} renamed to .tsrx`,
	strongFiles.length > 0
		? `${strongFiles.filter((f) => f.strong).length}/${strongFiles.length} Strong`
		: null,
	`${attention.filter((a) => a.severity === 'error').length} error(s)`,
].filter(Boolean);
process.stdout.write(
	`\n${summary.join(', ')}${values['dry-run'] || values.print ? colors.dim(' (dry run)') : ''}\n`,
);
if (changed.length > 0 && !values['dry-run'] && !values.print) {
	process.stdout.write(
		colors.dim(
			`Next: run \`npx @octanejs/cli init\` in ${path.relative(process.cwd(), result.root) || '.'} to wire Octane into the build.\n`,
		),
	);
}
process.exit(exitCode(result));

/** @param {import('./project.js').CodemodResult} result */
function exitCode(result) {
	return result.files.some(
		(file) =>
			file.diagnostics.some((d) => d.severity === 'error') ||
			file.notes.some((n) => n.severity === 'error'),
	)
		? 1
		: 0;
}
