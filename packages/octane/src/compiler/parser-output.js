/** @import { ParseOptions } from '@tsrx/core/types' */

/**
 * Isolate caller-owned output buffers without changing parser options. An
 * unsolicited comments array would disable native eager parsing.
 * @param {ParseOptions} [options]
 * @param {boolean} [captureErrors]
 * @returns {ParseOptions | undefined}
 */
export function isolateOutputOptions(options, captureErrors = false) {
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
export function publishOutput(options, selected) {
	if (selected === options) return;
	if (Array.isArray(options?.errors)) {
		for (const error of selected?.errors ?? []) options.errors.push(error);
	}
	if (Array.isArray(options?.comments)) {
		for (const comment of selected?.comments ?? []) options.comments.push(comment);
	}
}
