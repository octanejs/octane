import { readFileSync } from 'node:fs';

/**
 * Parse JSON with comments and trailing commas, the dialect `tsconfig.json` and
 * every editor MCP config are actually written in. Comments and commas are
 * handled in one pass so that a `,` or `//` inside a string literal is never
 * mistaken for syntax.
 *
 * @param {string} text
 * @returns {unknown}
 */
export function parseJsonc(text) {
	let out = '';
	let lastMeaningful = -1;
	let i = 0;

	const push = (/** @type {string} */ ch) => {
		if ((ch === '}' || ch === ']') && lastMeaningful >= 0 && out[lastMeaningful] === ',') {
			out = out.slice(0, lastMeaningful) + out.slice(lastMeaningful + 1);
			lastMeaningful = -1;
			for (let j = out.length - 1; j >= 0; j--) {
				if (!/\s/.test(out[j])) {
					lastMeaningful = j;
					break;
				}
			}
		}
		out += ch;
		if (!/\s/.test(ch)) lastMeaningful = out.length - 1;
	};

	while (i < text.length) {
		const ch = text[i];

		if (ch === '"') {
			// Emit the whole literal verbatim. Nothing inside it is syntax, so a
			// `//`, a `]`, or a `,` in a string value must not reach `push`.
			const start = i++;
			while (i < text.length) {
				if (text[i] === '\\') {
					i += 2;
					continue;
				}
				if (text[i] === '"') {
					i++;
					break;
				}
				i++;
			}
			out += text.slice(start, i);
			lastMeaningful = out.length - 1;
			continue;
		}

		if (ch === '/' && text[i + 1] === '/') {
			while (i < text.length && text[i] !== '\n') i++;
			continue;
		}

		if (ch === '/' && text[i + 1] === '*') {
			i += 2;
			while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
			i += 2;
			continue;
		}

		push(ch);
		i++;
	}

	return JSON.parse(out);
}

/**
 * @param {string} file
 * @returns {any | null} `null` when the file is missing, empty, or unparseable
 */
export function readJsonc(file) {
	let text;
	try {
		text = readFileSync(file, 'utf8');
	} catch {
		return null;
	}
	if (text.trim() === '') return null;
	try {
		return parseJsonc(text);
	} catch {
		return null;
	}
}
