/** @import { ParseOptions } from '@tsrx/core/types' */
/** @import { Program } from 'estree' */

import { parseModule as parseNativeModule } from 'oxc-tsrx/tsrx-core-compat';
import { parseModule as parseJavaScriptModule } from './parser.browser.js';

import { isolateOutputOptions, publishOutput } from './parser-output.js';

/**
 * `<style>` with an expression child — `<style>{css}</style>`, an ordinary
 * element rather than a scoped block. The compat facade reads every `<style>`
 * element's raw text as CSS after its own error translation, so this shape
 * surfaces as a bare `Error` from that CSS reader instead of a `SyntaxError`.
 */
const STYLE_EXPRESSION_CHILD = /<style\b[^>]*>\s*\{/;

/**
 * A native rejection the JavaScript parser may still accept: a `SyntaxError`
 * the facade translated, or the bare `Error` its CSS reader raises for a
 * `<style>` expression child. Operational failures keep their own name or
 * code and stay visible, and so does any other bare `Error`: without the
 * `<style …>{` shape in the source there is nothing the CSS reader could have
 * rejected.
 * @param {unknown} error
 * @param {string} source
 * @returns {boolean}
 */
function isNativeSyntaxRejection(error, source) {
	if (!(error instanceof Error)) return false;
	if (error.name === 'ParserOperationalError') return false;
	if ('code' in error && typeof error.code === 'string' && error.code.startsWith('ERR_TSRX_')) {
		return false;
	}
	if (error instanceof SyntaxError) return true;
	return (
		error.name === 'Error' && error.constructor === Error && STYLE_EXPRESSION_CHILD.test(source)
	);
}

/**
 * Keep native parsing first while accepting authored syntax already supported
 * by the JavaScript parser, such as literal less-than text in TSRX children
 * or a `<style>` element with an expression child.
 * @param {string} source
 * @param {string} [filename]
 * @param {ParseOptions} [options]
 * @returns {Program}
 */
export function parseModule(source, filename = 'module.tsrx', options) {
	const resolvedFilename = filename || 'module.tsrx';
	const nativeOptions = isolateOutputOptions(options);
	let program;
	try {
		program = parseNativeModule(source, resolvedFilename, nativeOptions);
	} catch (nativeError) {
		// Operational failures must stay visible, even if given a syntax subclass.
		if (!isNativeSyntaxRejection(nativeError, source)) {
			publishOutput(options, nativeOptions);
			throw nativeError;
		}
		// Collect/loose can return a recovery AST. Capture even unrequested errors
		// so a recovery result cannot hide the native syntax rejection.
		const javaScriptOptions = isolateOutputOptions(options, true);
		try {
			program = parseJavaScriptModule(source, resolvedFilename, javaScriptOptions);
		} catch {
			publishOutput(options, nativeOptions);
			throw nativeError;
		}
		if (javaScriptOptions?.errors?.length) {
			publishOutput(options, nativeOptions);
			throw nativeError;
		}
		publishOutput(options, javaScriptOptions);
		return program;
	}
	// Caller buffer errors are not parser errors and must never trigger a retry.
	publishOutput(options, nativeOptions);
	return program;
}
