import { defineCommand } from '../kernel/command.js';
import { DATA, ERROR_DOCS_URL } from '../data/index.js';
import { CliError, usageError } from '../kernel/errors.js';

/**
 * Pull the code and any encoded arguments out of whatever the user pasted.
 *
 * A production build reports `Minified Octane error #3; visit
 * https://octanejs.dev/errors/3?args[]=...`, which hides the real message and
 * its arguments behind a URL. Accepting that string verbatim is the whole point
 * of this command, so a bare number, a `#3`, and the full sentence all work.
 *
 * @param {string} input
 * @returns {{ code: string, args: string[] } | null}
 */
export function parseErrorReference(input) {
	const code = /(?:#|errors\/)(\d+)|^\s*(\d+)\s*$/.exec(input);
	if (!code) return null;

	const args = [...input.matchAll(/args\[\]=([^&\s]*)/g)].map(([, value]) => {
		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	});

	return { code: code[1] ?? code[2], args };
}

/**
 * @param {string} template
 * @param {string[]} args
 * @returns {string}
 */
function fill(template, args) {
	let index = 0;
	return template.replace(/%s/g, () => (index < args.length ? args[index++] : '%s'));
}

export default defineCommand({
	description:
		'Look up an Octane runtime error. Accepts a bare code, or the whole minified\n' +
		'message a production build prints, arguments included.',
	positionals: [
		{ name: 'error', description: 'An error code, URL, or pasted message.', required: true },
	],

	async run(ctx, input) {
		const raw = input.positionals.join(' ').trim();
		if (!raw) throw usageError('Nothing to explain.', 'Try: octane explain 3');

		const reference = parseErrorReference(raw);
		if (!reference) {
			throw usageError(`Could not find an error code in "${raw}".`, 'Try: octane explain 3');
		}

		const entry = DATA.errorCodes[reference.code];
		if (!entry) {
			throw new CliError(`Unknown Octane error code ${reference.code}.`, {
				hint: `This CLI knows codes 1 to ${Object.keys(DATA.errorCodes).length}. Upgrade @octanejs/cli if the code is newer.`,
			});
		}

		const message = fill(entry.message, reference.args);
		const url = `${ERROR_DOCS_URL}${reference.code}`;

		ctx.ui.intro(`Octane error #${reference.code}`);
		ctx.ui.log('');
		ctx.ui.log(`  ${message}`);
		ctx.ui.log('');
		ctx.ui.log(`  ${ctx.ui.colors.dim(`runtime: ${entry.runtime.join(', ')}`)}`);
		if (entry.status !== 'active') {
			ctx.ui.log(`  ${ctx.ui.colors.yellow(`status: ${entry.status}`)}`);
		}
		if (entry.message.includes('%s') && reference.args.length === 0) {
			ctx.ui.log(
				`  ${ctx.ui.colors.dim('Paste the whole error message to have its arguments filled in.')}`,
			);
		}
		ctx.ui.outro(url);

		return {
			json: {
				code: Number(reference.code),
				message,
				template: entry.message,
				args: reference.args,
				runtime: entry.runtime,
				status: entry.status,
				url,
			},
		};
	},
});
