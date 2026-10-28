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
	allowNegative: true,
	options: {
		strong: { type: 'boolean', default: false },
		'force-strong': { type: 'boolean', default: false },
		target: { type: 'string', default: 'tsrx' },
		'dry-run': { type: 'boolean', default: false },
		print: { type: 'boolean', default: false },
		verify: { type: 'boolean', default: true },
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

const dryRun = values['dry-run'] || values.print;
const result = await runCodemod(positionals.length > 0 ? positionals : ['.'], {
	target: /** @type {'tsrx' | 'tsx'} */ (values.target),
	strong: values.strong || values['force-strong'],
	forceStrong: values['force-strong'],
	verify: values.verify,
	write: !dryRun,
});

// The codemod's own notes and the compiler's diagnostics, as one list.
const findings = result.files.flatMap((file) => [
	...file.notes
		.filter((note) => note.severity !== 'info')
		.map((note) => ({ file: file.output, ...note, code: note.rule })),
	...file.diagnostics.map((diagnostic) => ({ file: file.output, ...diagnostic })),
]);
const errors = findings.filter((finding) => finding.severity === 'error');

if (values.json) {
	const files = result.files.map(({ code, ...file }) => (values.print ? { ...file, code } : file));
	process.stdout.write(JSON.stringify({ ...result, files }, null, 2) + '\n');
	process.exit(errors.length > 0 ? 1 : 0);
}

const changed = result.files.filter((file) => file.changed);
for (const file of changed) {
	const arrow = file.output === file.file ? '' : ` → ${file.output}`;
	const rules = Object.entries(file.rules)
		.map(([rule, count]) => (count > 1 ? `${rule}×${count}` : rule))
		.join(', ');
	const mode =
		file.strong === null ? '' : file.strong ? colors.green(' strong') : colors.yellow(' compat');
	const mark = errors.some((error) => error.file === file.output)
		? colors.red('✗')
		: colors.green('✓');
	process.stdout.write(`${mark} ${file.file}${arrow}${mode}  ${colors.dim(rules)}\n`);
	if (values.print) process.stdout.write(colors.dim('─'.repeat(60)) + '\n' + file.code + '\n');
}

if (findings.length > 0) {
	process.stdout.write(`\n${colors.bold('Needs attention')}\n`);
	for (const finding of findings) {
		const tag = finding.severity === 'error' ? colors.red : colors.yellow;
		const message = finding.message.split('\n')[0];
		process.stdout.write(
			`  ${finding.file}:${finding.line} ${tag(finding.severity)} ${colors.dim(finding.code)} ${message}\n`,
		);
	}
}
if (result.packages.length > 0) {
	process.stdout.write(`\n${colors.bold('Dependencies')}\n`);
	for (const { from, to } of result.packages) process.stdout.write(`  ${from} → ${to}\n`);
}
for (const page of result.html) process.stdout.write(`\nUpdated the entry script in ${page}\n`);

const strong = changed.filter((file) => file.strong !== null);
const summary = [
	`${changed.length} module(s) migrated`,
	`${changed.filter((file) => file.output !== file.file).length} renamed to .tsrx`,
	strong.length > 0
		? `${strong.filter((file) => file.strong).length}/${strong.length} Strong`
		: null,
	`${errors.length} error(s)`,
].filter(Boolean);
process.stdout.write(`\n${summary.join(', ')}${dryRun ? colors.dim(' (dry run)') : ''}\n`);
if (changed.length > 0 && !dryRun) {
	const root = path.relative(process.cwd(), result.root) || '.';
	process.stdout.write(
		colors.dim(`Next: run \`npx @octanejs/cli init\` in ${root} to wire Octane into the build.\n`),
	);
}
process.exit(errors.length > 0 ? 1 : 0);
