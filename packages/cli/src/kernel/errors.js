/**
 * Exit codes are part of the CLI's contract: CI and agents branch on them, so
 * they are fixed here rather than invented per command.
 *
 * - `OK`         nothing to report
 * - `FAILURE`    the command ran and failed
 * - `USAGE`      the invocation was wrong (unknown flag, missing input)
 * - `DIAGNOSTIC` the command ran fine and reported problems (doctor findings)
 */
export const EXIT = {
	OK: 0,
	FAILURE: 1,
	USAGE: 2,
	DIAGNOSTIC: 3,
};

/**
 * An error with a presentation. Anything thrown as a `CliError` is rendered as
 * a message the caller can act on; anything else is an internal bug and is
 * reported with its stack.
 */
export class CliError extends Error {
	/**
	 * @param {string} message
	 * @param {{ exitCode?: number, hint?: string }} [options]
	 */
	constructor(message, options = {}) {
		super(message);
		this.name = 'CliError';
		this.exitCode = options.exitCode ?? EXIT.FAILURE;
		this.hint = options.hint;
	}
}

/**
 * @param {string} message
 * @param {string} [hint]
 * @returns {CliError}
 */
export function usageError(message, hint) {
	return new CliError(message, { exitCode: EXIT.USAGE, hint });
}
