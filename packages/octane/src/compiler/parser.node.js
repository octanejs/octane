/** @import { ParseOptions } from '@tsrx/core/types' */
/** @import { Program } from 'estree' */

import { parseModule as parseNativeModule } from 'oxc-tsrx/tsrx-core-compat';
import { parseModule as parseJavaScriptModule } from './parser.browser.js';

/**
 * Isolate caller-owned output buffers without changing parser options. An
 * unsolicited comments array would disable native eager parsing.
 * @param {ParseOptions} [options]
 * @param {boolean} [captureErrors]
 * @returns {ParseOptions | undefined}
 */
function isolateOutputOptions(options, captureErrors = false) {
	if (!captureErrors && !Array.isArray(options?.errors) && !Array.isArray(options?.comments)) {
		return options;
	}
	const original = options ?? {};
	const descriptors = Object.getOwnPropertyDescriptors(original);
	if (captureErrors || Array.isArray(options?.errors)) {
		descriptors.errors = { value: [], enumerable: true, writable: true, configurable: true };
	}
	if (Array.isArray(options?.comments)) {
		descriptors.comments = { value: [], enumerable: true, writable: true, configurable: true };
	}
	return Object.create(Object.getPrototypeOf(original), descriptors);
}

/**
 * @param {ParseOptions | undefined} options
 * @param {ParseOptions | undefined} selected
 */
function publishOutput(options, selected) {
	if (selected === options) return;
	if (Array.isArray(options?.errors)) {
		for (const error of selected?.errors ?? []) options.errors.push(error);
	}
	if (Array.isArray(options?.comments)) {
		for (const comment of selected?.comments ?? []) options.comments.push(comment);
	}
}

/**
 * Keep native parsing first while accepting authored syntax already supported
 * by the JavaScript parser, such as literal less-than text in TSRX children.
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
		if (
			!(nativeError instanceof SyntaxError) ||
			nativeError.name === 'ParserOperationalError' ||
			('code' in nativeError &&
				typeof nativeError.code === 'string' &&
				nativeError.code.startsWith('ERR_TSRX_'))
		) {
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
