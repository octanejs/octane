/**
 * The Octane mark, for the root invocation only.
 *
 * It is decoration, so it appears exactly where decoration is harmless: a human
 * run of bare `octane` or `octane --help`. Never under `--json`, where it would
 * sit in front of the document, and never on a subcommand, where it would be
 * noise on every `doctor` run in a loop.
 *
 * The glyphs are the art itself, not a fill pattern: their varying weight is
 * what gives the flame its shading, so they are kept verbatim rather than
 * flattened to block characters. Colour is the only thing applied on top, and
 * it follows the two fills in `icon.svg`.
 */
const MARK = [
	'        :&',
	'      ::&&',
	'     :&&&&&&:',
	'  :&&&&r; :&&&:',
	' &&&&&rr; rr&&&',
	':&&:&rrrrrr&&&&',
	' &&&&rr&r&&&&:',
	'  ::&&&&&::',
];

/**
 * The low-ink glyphs that make up the inner flame. Everything else is the outer
 * body, including the edge characters that share some of these shapes.
 */
const INNER = new Set('rltj;-|+_');

/** The two fills in `icon.svg`, which are also `--text` and `--accent` on the site. */
const CREAM = [244, 238, 232];
const FIRE = [255, 65, 90];

/**
 * @param {import('./ui.js').Ui} ui
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ cream: (s: string) => string, fire: (s: string) => string }}
 */
function palette(ui, env) {
	if (ui.mode !== 'interactive') {
		const plain = (/** @type {string} */ s) => s;
		return { cream: plain, fire: plain };
	}
	if (env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit') {
		const rgb =
			(/** @type {number[]} */ [r, g, b]) =>
			(/** @type {string} */ s) =>
				`\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;
		return { cream: rgb(CREAM), fire: rgb(FIRE) };
	}
	// 256- and 16-colour terminals: the mark still reads as a two-tone flame,
	// just in the nearest available pair.
	return { cream: ui.colors.white, fire: ui.colors.red };
}

/**
 * Colour a row, emitting one escape per run of like-coloured glyphs rather than
 * per character.
 *
 * @param {string} row
 * @param {ReturnType<typeof palette>} colors
 * @returns {string}
 */
function paintRow(row, colors) {
	let out = '';
	for (let i = 0; i < row.length;) {
		const kind = row[i] === ' ' ? 'gap' : INNER.has(row[i]) ? 'inner' : 'outer';
		let end = i;
		while (
			end < row.length &&
			(row[end] === ' ' ? 'gap' : INNER.has(row[end]) ? 'inner' : 'outer') === kind
		) {
			end++;
		}
		const run = row.slice(i, end);
		out += kind === 'gap' ? run : (kind === 'inner' ? colors.fire : colors.cream)(run);
		i = end;
	}
	return out;
}

/**
 * @param {import('./context.js').Ctx} ctx
 */
export function renderBanner(ctx) {
	if (ctx.json) return;

	const colors = palette(ctx.ui, ctx.env);
	const { bold, dim } = ctx.ui.colors;

	ctx.ui.log('');
	for (const row of MARK) ctx.ui.log(`  ${paintRow(row, colors)}`);
	ctx.ui.log('');
	ctx.ui.log(`  ${bold(colors.cream('OCTANE CLI'))} ${dim(`v${ctx.version}`)}`);
	ctx.ui.log(`  ${dim("React's programming model, compiled.")}`);
	ctx.ui.log('');
}
