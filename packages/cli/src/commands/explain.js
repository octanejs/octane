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
 * Find a Strong compiler diagnostic in what the user pasted: the code itself,
 * the code without its `OCTANE_STRONG_` prefix, a whole compile error, or its
 * documentation link.
 *
 * @param {string} input
 * @returns {string | null} the full code, whether or not it is known
 */
export function parseStrongReference(input) {
	const code = /\bOCTANE_[A-Z0-9_]+\b/i.exec(input);
	if (code) return code[0].toUpperCase();
	const anchor = /#(octane-[a-z0-9-]+)/i.exec(input);
	if (anchor) return anchor[1].toUpperCase().replaceAll('-', '_');
	const short = /^\s*([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\s*$/i.exec(input);
	return short ? `OCTANE_STRONG_${short[1].toUpperCase()}` : null;
}

/**
 * @param {import('../kernel/context.js').Ctx} ctx
 * @param {string} code
 */
function explainStrong(ctx, code) {
	const entry = DATA.strongDiagnostics?.diagnostics?.[code];
	if (!entry) {
		throw new CliError(`Unknown Strong diagnostic ${code}.`, {
			hint: 'Upgrade @octanejs/cli if the code is newer, or see https://octanejs.dev/docs/strong-mode#diagnostic-reference',
		});
	}
	/** @typedef {{ id: string, title: string, react: string, strong: string, codes: string[] }} Recipe */
	/** @type {Recipe[]} */
	const recipes = (DATA.strongDiagnostics.recipes ?? []).filter((/** @type {Recipe} */ recipe) =>
		recipe.codes.includes(code),
	);

	ctx.ui.intro(code);
	ctx.ui.log('');
	ctx.ui.log(`  ${entry.detects}`);
	ctx.ui.log('');
	ctx.ui.log(`  ${ctx.ui.colors.bold('Replacement:')} ${entry.replacement}`);
	for (const recipe of recipes) {
		ctx.ui.log('');
		ctx.ui.log(`  ${ctx.ui.colors.bold(recipe.title)}`);
		ctx.ui.log(`    ${ctx.ui.colors.dim('React: ')} ${recipe.react}`);
		ctx.ui.log(`    ${ctx.ui.colors.dim('Strong:')} ${recipe.strong}`);
	}
	if (entry.severity === 'hint') {
		ctx.ui.log('');
		ctx.ui.log(`  ${ctx.ui.colors.dim('severity: hint')}`);
	}
	ctx.ui.outro(entry.url);

	return {
		json: {
			code,
			severity: entry.severity,
			detects: entry.detects,
			replacement: entry.replacement,
			recipes,
			url: entry.url,
		},
	};
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
		'Look up an Octane runtime error or Strong compiler diagnostic. Accepts a bare\n' +
		'code, the whole minified message a production build prints, arguments\n' +
		'included, or a Strong code such as OCTANE_STRONG_RENDER_REF_READ.',
	positionals: [
		{ name: 'error', description: 'An error code, URL, or pasted message.', required: true },
	],

	async run(ctx, input) {
		const raw = input.positionals.join(' ').trim();
		if (!raw) throw usageError('Nothing to explain.', 'Try: octane explain 3');

		// Runtime errors are numbered and Strong diagnostics are named, so a
		// pasted message names at most one kind.
		const strong = parseStrongReference(raw);
		if (strong !== null && (/\bOCTANE_/i.test(raw) || parseErrorReference(raw) === null)) {
			return explainStrong(ctx, strong);
		}

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
