import * as clack from '@clack/prompts';
import { createColors } from 'picocolors';
import { CliError, usageError } from './errors.js';

/**
 * @typedef {'interactive' | 'plain' | 'json'} UiMode
 *
 * - `interactive` a TTY session: clack prompts, colour, spinners
 * - `plain`       a pipe, a CI log, or `--no-color`: line-oriented text only
 * - `json`        `--json`: every human channel is silenced so stdout carries
 *                 exactly one JSON document
 */

/**
 * @typedef {Object} Choice
 * @property {string} value
 * @property {string} label
 * @property {string} [hint]
 */

export const SYMBOLS = {
	pass: '✔',
	fail: '✖',
	warn: '⚠',
	skip: '○',
};

/**
 * @param {{ json?: boolean, color?: boolean, tty?: boolean, env?: NodeJS.ProcessEnv }} options
 * @returns {UiMode}
 */
export function resolveMode({ json = false, color = true, tty = false, env = {} } = {}) {
	if (json) return 'json';
	if (!tty || !color || env.NO_COLOR || env.CI) return 'plain';
	return 'interactive';
}

/**
 * @param {{ mode: UiMode, yes?: boolean, stdout?: NodeJS.WritableStream }} options
 */
export function createUi({ mode, yes = false, stdout = process.stdout }) {
	const quiet = mode === 'json';
	const colors = createColors(mode === 'interactive');
	const write = (/** @type {string} */ line) => {
		if (!quiet) stdout.write(`${line}\n`);
	};

	/**
	 * Non-interactive sessions never block. Either `--yes` supplies the default
	 * or the caller is told the exact flag that would have answered the prompt.
	 *
	 * @param {string} flag
	 * @param {unknown} fallback
	 */
	const unattended = (flag, fallback) => {
		if (yes && fallback !== undefined) return fallback;
		throw usageError(
			`${flag} is required when the CLI is not interactive.`,
			`Pass ${flag}, or re-run in a terminal to be prompted.`,
		);
	};

	/**
	 * Whether `--yes` already answers this question.
	 *
	 * It means "stop asking me", which is as true on a terminal as it is in a
	 * pipe. Consulting it only once the CLI had decided nobody was watching made
	 * the flag do nothing in the one place people type it by hand, and left a
	 * caller wanting an unattended run no choice but to claim there was no
	 * terminal, which costs the interactive rendering with it. A question with no
	 * default has nothing to answer with, so it is still asked.
	 *
	 * @param {unknown} initial
	 */
	const answered = (initial) => yes && initial !== undefined;

	/** @param {unknown} value */
	const guard = (value) => {
		if (clack.isCancel(value)) throw new CliError('Cancelled.');
		return value;
	};

	return {
		mode,
		colors,
		get canPrompt() {
			return mode === 'interactive';
		},

		/** @param {string} title */
		intro(title) {
			if (mode === 'interactive') clack.intro(colors.bgCyan(colors.black(` ${title} `)));
			else write(title);
		},

		/** @param {string} message */
		outro(message) {
			if (mode === 'interactive') clack.outro(message);
			else write(message);
		},

		/** @param {string} [line] */
		log(line = '') {
			write(line);
		},

		/**
		 * @param {string} title
		 * @param {string[]} lines
		 */
		note(title, lines) {
			if (mode === 'interactive') clack.note(lines.join('\n'), title);
			else {
				write(title);
				for (const line of lines) write(`  ${line}`);
			}
		},

		/** @param {string} label */
		spinner(label) {
			if (mode !== 'interactive') {
				write(label);
				return { update() {}, stop: (/** @type {string} */ done) => done && write(`  ${done}`) };
			}
			const spin = clack.spinner();
			spin.start(label);
			return {
				update: (/** @type {string} */ message) => spin.message(message),
				stop: (/** @type {string} */ message) => spin.stop(message ?? label),
			};
		},

		/**
		 * Choices are always strings (command names, client ids, mode names), so
		 * this deliberately is not generic: callers narrow the result themselves.
		 *
		 * @param {{ message: string, flag: string, options: Choice[], initial?: string }} options
		 * @returns {Promise<string>}
		 */
		async select({ message, flag, options, initial }) {
			if (answered(initial)) return String(initial);
			if (mode !== 'interactive') return String(unattended(flag, initial));
			return String(guard(await clack.select({ message, options, initialValue: initial })));
		},

		/**
		 * A free-text answer. `initial` is what an empty submission means, not
		 * pre-filled input: someone accepting the offer by pressing enter and
		 * someone typing it out should land in the same place.
		 *
		 * @param {{ message: string, flag: string, placeholder?: string, initial?: string }} options
		 * @returns {Promise<string>}
		 */
		async text({ message, flag, placeholder, initial }) {
			if (answered(initial)) return String(initial);
			if (mode !== 'interactive') return String(unattended(flag, initial));
			const answer = String(
				guard(await clack.text({ message, placeholder, defaultValue: initial })),
			);
			return answer.trim() === '' && initial !== undefined ? initial : answer.trim();
		},

		/**
		 * @param {{ message: string, flag: string, options: Choice[], initial?: string[] }} options
		 * @returns {Promise<string[]>}
		 */
		async multiselect({ message, flag, options, initial }) {
			// `answered` is a boolean, not a type guard, and this is the one prompt
			// that hands its default straight back rather than coercing it.
			if (answered(initial)) return /** @type {string[]} */ (initial);
			if (mode !== 'interactive') {
				return /** @type {string[]} */ (unattended(flag, initial));
			}
			return /** @type {string[]} */ (
				guard(await clack.multiselect({ message, options, initialValues: initial }))
			);
		},

		/**
		 * @param {{ message: string, flag: string, initial?: boolean }} options
		 * @returns {Promise<boolean>}
		 */
		async confirm({ message, flag, initial = true }) {
			if (answered(initial)) return Boolean(initial);
			if (mode !== 'interactive') return Boolean(unattended(flag, initial));
			return Boolean(guard(await clack.confirm({ message, initialValue: initial })));
		},
	};
}

/** @typedef {ReturnType<typeof createUi>} Ui */
