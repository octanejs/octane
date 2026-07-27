/**
 * Surgical JSONC editing.
 *
 * `--fix` rewrites files people hand-maintain, so edits are made as text
 * splices rather than by reparsing and reserializing. A tsconfig that comes
 * back with its comments stripped and its formatting churned is a worse outcome
 * than the problem being fixed.
 */

/**
 * Match the object that starts at `open`, skipping over string literals.
 *
 * @param {string} text
 * @param {number} open index of the `{`
 * @returns {number} index of the matching `}`, or -1
 */
function matchBrace(text, open) {
	let depth = 0;
	for (let i = open; i < text.length; i++) {
		const ch = text[i];
		if (ch === '"') {
			i++;
			while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
			continue;
		}
		if (ch === '{' || ch === '[') depth++;
		else if (ch === '}' || ch === ']') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

/**
 * Locate a top-level property inside the object spanning [open, close].
 *
 * @param {string} text
 * @param {number} open
 * @param {number} close
 * @param {string} key
 * @returns {{ start: number, valueStart: number, valueEnd: number } | null}
 */
function findProperty(text, open, close, key) {
	const needle = `"${key}"`;
	let depth = 0;

	for (let i = open + 1; i < close; i++) {
		const ch = text[i];
		if (ch === '"') {
			const start = i;
			i++;
			while (i < close && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
			if (depth === 0 && text.slice(start, i + 1) === needle) {
				let cursor = i + 1;
				while (cursor < close && /\s/.test(text[cursor])) cursor++;
				if (text[cursor] !== ':') continue;
				cursor++;
				while (cursor < close && /\s/.test(text[cursor])) cursor++;
				const valueStart = cursor;
				const valueEnd =
					text[cursor] === '{' || text[cursor] === '['
						? matchBrace(text, cursor) + 1
						: scanScalar(text, cursor, close);
				return { start, valueStart, valueEnd };
			}
			continue;
		}
		if (ch === '{' || ch === '[') depth++;
		else if (ch === '}' || ch === ']') depth--;
	}
	return null;
}

/**
 * @param {string} text
 * @param {number} from
 * @param {number} limit
 * @returns {number}
 */
function scanScalar(text, from, limit) {
	if (text[from] === '"') {
		let i = from + 1;
		while (i < limit && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
		return i + 1;
	}
	let i = from;
	while (i < limit && !/[,}\]\n]/.test(text[i])) i++;
	return i;
}

/**
 * @param {string} text
 * @param {number} open
 * @returns {string}
 */
function detectIndent(text, open) {
	const rest = text.slice(open + 1);
	const match = /^\r?\n([ \t]+)/.exec(rest);
	if (match) return match[1];
	const outer = /\n([ \t]+)[^\n]*$/.exec(text.slice(0, open));
	return outer ? `${outer[1]}${outer[1]}` : '\t';
}

/**
 * Set `compilerOptions.<key>` to a JSON value, adding `compilerOptions` itself
 * if the file does not have one.
 *
 * @param {string} text
 * @param {string} key
 * @param {unknown} value
 * @returns {{ text: string, changed: boolean } | null} `null` when the shape is
 *   not one this editor can change safely
 */
export function setCompilerOption(text, key, value) {
	const serialized = JSON.stringify(value);
	const rootOpen = text.indexOf('{');
	if (rootOpen === -1) return null;
	const rootClose = matchBrace(text, rootOpen);
	if (rootClose === -1) return null;

	const options = findProperty(text, rootOpen, rootClose, 'compilerOptions');

	if (!options) {
		const indent = detectIndent(text, rootOpen);
		const insertion = `\n${indent}"compilerOptions": { ${JSON.stringify(key)}: ${serialized} },`;
		return {
			text: text.slice(0, rootOpen + 1) + insertion + text.slice(rootOpen + 1),
			changed: true,
		};
	}

	if (text[options.valueStart] !== '{') return null;
	const open = options.valueStart;
	const close = matchBrace(text, open);
	if (close === -1) return null;

	const existing = findProperty(text, open, close, key);
	if (existing) {
		if (text.slice(existing.valueStart, existing.valueEnd).trim() === serialized) {
			return { text, changed: false };
		}
		return {
			text: text.slice(0, existing.valueStart) + serialized + text.slice(existing.valueEnd),
			changed: true,
		};
	}

	const indent = detectIndent(text, open);
	const body = text.slice(open + 1, close);
	const separator = body.trim() === '' ? '' : ',';
	const insertion = `\n${indent}${JSON.stringify(key)}: ${serialized}${separator}`;
	return { text: text.slice(0, open + 1) + insertion + text.slice(open + 1), changed: true };
}

/**
 * Resolve a nested property to its value range, for callers that want to splice
 * rather than reserialize.
 *
 * @param {string} text
 * @param {string[]} keys
 * @returns {{ valueStart: number, valueEnd: number } | null}
 */
export function findNestedProperty(text, keys) {
	let open = text.indexOf('{');
	if (open === -1) return null;
	let close = matchBrace(text, open);
	if (close === -1) return null;

	/** @type {{ start: number, valueStart: number, valueEnd: number } | null} */
	let found = null;

	for (const key of keys) {
		found = findProperty(text, open, close, key);
		if (!found) return null;
		if (text[found.valueStart] === '{') {
			open = found.valueStart;
			close = matchBrace(text, open);
			if (close === -1) return null;
		}
	}

	return found && { valueStart: found.valueStart, valueEnd: found.valueEnd };
}
