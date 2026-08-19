import { strongHash } from '@tsrx/core';

/** The serializable contract between the optional TypeScript project and compiler. */
export const TEXT_TYPE_FACTS_VERSION = 1;

/** Normalize bundler suffixes without importing filesystem or Node path utilities. */
export function normalizeTextTypeFilename(filename) {
	if (typeof filename !== 'string') return null;
	const normalized = filename.replace(/\\/g, '/');
	const query = normalized.indexOf('?');
	// A leading `#` can be a package-import alias, not a URL fragment.
	const hash = normalized.indexOf('#', normalized.startsWith('#') ? 1 : 0);
	let end = normalized.length;
	if (query !== -1) end = query;
	if (hash !== -1 && hash < end) end = hash;
	return normalized.slice(0, end);
}

/**
 * Identity of the complete authored source, including CRs and UTF-16 offsets.
 * core's browser-safe SHA helper normalizes raw CRs and returns a short prefix,
 * so hash the JSON spelling in two domains. This is a correctness-cache key,
 * not an authentication token.
 * @param {string} source
 * @returns {string}
 */
export function textTypeSourceVersion(source) {
	const encoded = JSON.stringify(source);
	return `${source.length}:${strongHash(`octane:text-types:1\0${encoded}`)}${strongHash(`octane:text-types:2\0${encoded}`)}`;
}

/**
 * Validate an explicitly supplied snapshot before any lowering changes its
 * authored ranges. A missing snapshot opts out; an invalid one is an error,
 * because independently falling back on the client/server could change the
 * hydration protocol. Nested ranges are valid when a child expression contains
 * JSX with child expressions of its own.
 * @returns {Set<string> | null}
 */
export function createTextTypeFactsLookup(facts, filename, source) {
	if (facts === undefined) return null;
	const cleanFilename = normalizeTextTypeFilename(filename);
	const invalid = (reason) => {
		throw new Error(`Invalid textTypeFacts for ${JSON.stringify(cleanFilename)}: ${reason}.`);
	};
	if (facts === null || typeof facts !== 'object' || Array.isArray(facts)) {
		invalid('expected a versioned snapshot');
	}
	if (facts.version !== TEXT_TYPE_FACTS_VERSION) invalid('unsupported version');
	if (
		typeof facts.filename !== 'string' ||
		cleanFilename === null ||
		cleanFilename.length === 0 ||
		normalizeTextTypeFilename(facts.filename) !== cleanFilename
	) {
		invalid('filename does not match the compiled source');
	}
	if (facts.sourceVersion !== textTypeSourceVersion(source)) {
		invalid('sourceVersion does not match the complete authored source');
	}
	if (typeof facts.projectVersion !== 'string' || facts.projectVersion.length === 0) {
		invalid('projectVersion must identify the TypeScript project snapshot');
	}
	if (!Array.isArray(facts.stringChildRanges)) invalid('stringChildRanges must be an array');
	const ranges = new Set();
	let previousStart = -1;
	let previousEnd = -1;
	for (const range of facts.stringChildRanges) {
		if (
			!Array.isArray(range) ||
			range.length !== 2 ||
			!Number.isSafeInteger(range[0]) ||
			!Number.isSafeInteger(range[1]) ||
			range[0] < 0 ||
			range[0] >= range[1] ||
			range[1] > source.length
		) {
			invalid('stringChildRanges contains an invalid authored range');
		}
		const [start, end] = range;
		if (start < previousStart || (start === previousStart && end <= previousEnd)) {
			invalid('stringChildRanges must be sorted and unique');
		}
		previousStart = start;
		previousEnd = end;
		ranges.add(`${start}:${end}`);
	}
	return ranges;
}
