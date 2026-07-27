import { readFileSync } from 'node:fs';
import { parseArgs } from './args.js';
import { renderBanner } from './banner.js';
import { resolveCommand } from './command.js';
import { createContext } from './context.js';
import { CliError, EXIT, usageError } from './errors.js';
import { renderHelp } from './help.js';
import { COMMANDS } from './registry.js';

export const VERSION = JSON.parse(
	readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
).version;

/**
 * @typedef {Object} RunOptions
 * @property {NodeJS.ProcessEnv} [env]
 * @property {NodeJS.WritableStream} [stdout]
 * @property {NodeJS.WritableStream} [stderr]
 * @property {boolean} [tty]
 * @property {import('./exec.js').Exec} [exec]
 */

/**
 * Offer the commands available at `path` and dispatch the chosen one.
 *
 * Recursive by construction: choosing a group re-enters `dispatch`, which finds
 * a module with subcommands and no `run` and calls back here. So `octane` then
 * `mcp` walks into add/status/remove without the caller knowing how deep the
 * tree goes.
 *
 * @param {import('./context.js').Ctx} ctx
 * @param {RunOptions} options the original invocation options, so the chosen
 *   command runs against the same streams and injected process access
 * @param {string[]} path commands already chosen
 * @param {import('./command.js').CommandEntry[]} entries what is available here
 * @returns {Promise<number>}
 */
async function runMenu(ctx, options, path, entries) {
	const name = await ctx.ui.select({
		message: path.length === 0 ? 'What would you like to do?' : `octane ${path.join(' ')}`,
		flag: '<command>',
		options: entries.map((entry) => ({
			value: entry.name,
			label: entry.name,
			hint: entry.summary,
		})),
	});
	return dispatch([...path, name], options);
}

/**
 * @param {string[]} argv
 * @param {RunOptions} options
 * @returns {Promise<number>}
 */
async function dispatch(argv, options) {
	const stdout = options.stdout ?? process.stdout;
	const { path, module, argv: rest } = await resolveCommand(COMMANDS, argv);

	if (!module && rest.length > 0 && !rest[0].startsWith('-')) {
		throw usageError(`Unknown command: ${rest[0]}`, 'Run `octane --help` to list commands.');
	}

	const parsed = parseArgs(rest, module ?? {});
	const ctx = createContext({
		flags: parsed.flags,
		version: VERSION,
		env: options.env,
		stdout,
		tty: options.tty,
		exec: options.exec,
	});

	// `--version` is documented as a global flag, so it answers everywhere rather
	// than only at the root.
	if (parsed.flags.version) {
		if (ctx.json) stdout.write(`${JSON.stringify({ version: VERSION }, null, 2)}\n`);
		else ctx.ui.log(VERSION);
		return EXIT.OK;
	}

	if (!module?.run || parsed.flags.help) {
		if (ctx.json) {
			const listed = module?.subcommands ?? COMMANDS;
			stdout.write(
				`${JSON.stringify(
					{
						command: path.join(' ') || null,
						commands: listed.map((e) => ({ name: e.name, summary: e.summary })),
					},
					null,
					2,
				)}\n`,
			);
			return EXIT.OK;
		}
		// Root invocation only: the wordmark heads `octane` and `octane --help`,
		// not every subcommand's help.
		if (path.length === 0) renderBanner(ctx);

		// Nothing runnable was named, so offer what is available here instead of
		// printing help at someone who has not asked for it. `--help` is an
		// explicit request for the text, so it still wins.
		const choices = module?.subcommands ?? (module ? [] : COMMANDS);
		if (!parsed.flags.help && ctx.ui.canPrompt && choices.length > 0) {
			return runMenu(ctx, options, path, choices);
		}
		ctx.ui.log(renderHelp({ path, module, entries: COMMANDS, colors: ctx.ui.colors }));
		return EXIT.OK;
	}

	// Commands that write into a project need one to exist. Without this they
	// fail deep inside an fs call with a raw ENOENT stack.
	if (module.requiresProject && ctx.project().manifestPath === null) {
		throw new CliError(`No package.json found in ${ctx.cwd} or any parent directory.`, {
			hint: 'Run this inside a project, or create one first with `npm init -y`.',
		});
	}

	const result = await module.run(ctx, {
		flags: parsed.flags,
		positionals: parsed.positionals,
		rest: parsed.rest,
	});

	if (typeof result === 'number') return result;
	if (result && typeof result === 'object') {
		if (ctx.json && result.json !== undefined) {
			stdout.write(`${JSON.stringify(result.json, null, 2)}\n`);
		}
		return result.exitCode ?? EXIT.OK;
	}
	return EXIT.OK;
}

/**
 * Entry point. Never throws: every failure is rendered and turned into an exit
 * code, in the caller's chosen output format.
 *
 * @param {string[]} argv
 * @param {RunOptions} [options]
 * @returns {Promise<number>}
 */
export async function main(argv, options = {}) {
	const stderr = options.stderr ?? process.stderr;
	// Read from raw argv: a failure can happen before the flags are parsed, and
	// the parser accepts `--json=true` as well as the bare form.
	const json = argv.some((token) => token === '--json' || token.startsWith('--json='));

	try {
		return await dispatch(argv, options);
	} catch (error) {
		const known = error instanceof CliError;
		const message = error instanceof Error ? error.message : String(error);

		if (json) {
			stderr.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
		} else {
			stderr.write(`\n${message}\n`);
			if (known && error.hint) stderr.write(`${error.hint}\n`);
			if (!known && error instanceof Error && error.stack) stderr.write(`\n${error.stack}\n`);
		}

		return known ? error.exitCode : EXIT.FAILURE;
	}
}
