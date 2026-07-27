/**
 * Surgical JSONC editing.
 *
 * `--fix` rewrites files people hand-maintain, so edits are made as text
 * splices rather than by reparsing and reserializing. A tsconfig that comes
 * back with its comments stripped and its formatting churned is a worse outcome
 * than the problem being fixed.
 */

/**
 * Advance past a string literal or a comment beginning at `i`.
 *
 * Every scanner below routes through this. `tsconfig.json` is JSONC, so a `}`
 * or a quoted key inside a comment is ordinary prose: treating it as syntax
 * closes the wrong object and lets an edit land in the comment, or duplicate a
 * key that was already there.
 *
 * @param {string} text
 * @param {number} i
 * @returns {{ end: number, kind: 'string' | 'comment' } | null}
 */
function skipTrivia(text, i) {
	if (text[i] === '/' && text[i + 1] === '/') {
		let j = i + 2;
		while (j < text.length && text[j] !== '\n') j++;
		return { end: j, kind: 'comment' };
	}
	if (text[i] === '/' && text[i + 1] === '*') {
		let j = i + 2;
		while (j < text.length && !(text[j] === '*' && text[j + 1] === '/')) j++;
		return { end: Math.min(j + 2, text.length), kind: 'comment' };
	}
	if (text[i] === '"') {
		let j = i + 1;
		while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
		return { end: j + 1, kind: 'string' };
	}
	return null;
}

/**
 * Index of the document's opening brace, skipping any leading comment.
 *
 * @param {string} text
 * @returns {number}
 */
function findRootBrace(text) {
	for (let i = 0; i < text.length;) {
		const trivia = skipTrivia(text, i);
		if (trivia) {
			i = trivia.end;
			continue;
		}
		if (text[i] === '{') return i;
		i++;
	}
	return -1;
}

/**
 * Match the object that starts at `open`.
 *
 * @param {string} text
 * @param {number} open index of the `{`
 * @returns {number} index of the matching `}`, or -1
 */
function matchBrace(text, open) {
	let depth = 0;
	for (let i = open; i < text.length;) {
		const trivia = skipTrivia(text, i);
		if (trivia) {
			i = trivia.end;
			continue;
		}
		const ch = text[i];
		if (ch === '{' || ch === '[') depth++;
		else if (ch === '}' || ch === ']') {
			depth--;
			if (depth === 0) return i;
		}
		i++;
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

	for (let i = open + 1; i < close;) {
		const trivia = skipTrivia(text, i);
		if (trivia) {
			if (trivia.kind === 'string' && depth === 0 && text.slice(i, trivia.end) === needle) {
				let cursor = trivia.end;
				while (cursor < close && /\s/.test(text[cursor])) cursor++;
				if (text[cursor] === ':') {
					cursor++;
					while (cursor < close && /\s/.test(text[cursor])) cursor++;
					const valueStart = cursor;
					const valueEnd =
						text[cursor] === '{' || text[cursor] === '['
							? matchBrace(text, cursor) + 1
							: scanScalar(text, cursor, close);
					return { start: i, valueStart, valueEnd };
				}
			}
			i = trivia.end;
			continue;
		}
		const ch = text[i];
		if (ch === '{' || ch === '[') depth++;
		else if (ch === '}' || ch === ']') depth--;
		i++;
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
	const trivia = skipTrivia(text, from);
	if (trivia?.kind === 'string') return trivia.end;

	let i = from;
	// Stop before a trailing comment as well as the structural characters: the
	// value ends where the comment begins, and the comment is not ours to move.
	while (i < limit && !/[,}\]\n]/.test(text[i]) && !(text[i] === '/' && /[/*]/.test(text[i + 1]))) {
		i++;
	}
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
	const rootOpen = findRootBrace(text);
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
