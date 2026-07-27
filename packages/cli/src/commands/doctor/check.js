/**
 * @typedef {'pass' | 'fail' | 'warn' | 'skip'} CheckStatus
 */

/**
 * @typedef {Object} CheckResult
 * @property {CheckStatus} status
 * @property {string} message one line, present tense, states the finding
 * @property {string[]} [detail] evidence and the remedy, shown under the message
 * @property {string} [docs] documentation slug, appended to the docs base URL
 */

/**
 * @typedef {Object} FixOutcome
 * @property {boolean} changed
 * @property {string} message
 * @property {string[]} [files] paths written, relative to the project root
 */

/**
 * @typedef {Object} Check
 * @property {string} id stable, dot-separated: `<category>.<subject>`
 * @property {string} title
 * @property {'environment' | 'dependencies' | 'bundler' | 'typescript' | 'config' | 'source'} category
 * @property {'error' | 'warning' | 'info'} severity how a `fail` is scored
 * @property {(project: import('../../kernel/project.js').Project) => boolean} [applies]
 * @property {(ctx: import('../../kernel/context.js').Ctx, project: import('../../kernel/project.js').Project) => CheckResult | Promise<CheckResult>} run
 * @property {(ctx: import('../../kernel/context.js').Ctx, project: import('../../kernel/project.js').Project) => FixOutcome | Promise<FixOutcome>} [fix]
 *   Present only when the repair is mechanical and unambiguous. A check without
 *   `fix` reports the remedy in `detail` instead of guessing at the edit.
 */

/** @type {(message: string, extra?: Partial<CheckResult>) => CheckResult} */
export const pass = (message, extra) => ({ status: 'pass', message, ...extra });

/** @type {(message: string, extra?: Partial<CheckResult>) => CheckResult} */
export const fail = (message, extra) => ({ status: 'fail', message, ...extra });

/** @type {(message: string, extra?: Partial<CheckResult>) => CheckResult} */
export const warn = (message, extra) => ({ status: 'warn', message, ...extra });

/** @type {(message: string, extra?: Partial<CheckResult>) => CheckResult} */
export const skip = (message, extra) => ({ status: 'skip', message, ...extra });
