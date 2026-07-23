'use strict';

const OCTANE_TSRX_LANGUAGE_ID = 'octane-tsrx';
const AUTO_CLOSING_CONFIGURATION = 'octane.tsrx.autoClosingTags';

/**
 * Find an opening JSX tag whose final `>` was inserted at `offset`. Attribute
 * expressions may contain arrows, comparisons, strings, and nested delimiters;
 * those `>` characters must not be mistaken for the end of the tag.
 *
 * @param {string} text
 * @param {number} offset
 */
function findOpeningTagAtOffset(text, offset) {
	if (offset < 2 || text[offset - 1] !== '>') return undefined;
	const searchStart = Math.max(0, offset - 50_000);
	let tagStart = text.lastIndexOf('<', offset - 1);

	while (tagStart >= searchStart) {
		const candidate = text.slice(tagStart, offset);
		const match = candidate.match(/^<([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)(?=[\s/>])/);
		if (match) {
			const before = text[tagStart - 1];
			if (before && /[\w$.)\]]/.test(before)) return undefined;
			if (candidate.slice(0, -1).trimEnd().endsWith('/')) return undefined;

			let quote;
			let escaped = false;
			let braces = 0;
			let brackets = 0;
			let parentheses = 0;
			for (let index = match[0].length; index < candidate.length; index++) {
				const character = candidate[index];
				if (quote) {
					if (escaped) escaped = false;
					else if (character === '\\') escaped = true;
					else if (character === quote) quote = undefined;
					continue;
				}
				if (character === '"' || character === "'" || character === '`') {
					quote = character;
					continue;
				}
				if (character === '{') braces++;
				else if (character === '}') braces--;
				else if (character === '[') brackets++;
				else if (character === ']') brackets--;
				else if (character === '(') parentheses++;
				else if (character === ')') parentheses--;
				else if (
					character === '>' &&
					index !== candidate.length - 1 &&
					braces === 0 &&
					brackets === 0 &&
					parentheses === 0
				) {
					return undefined;
				}
				if (braces < 0 || brackets < 0 || parentheses < 0) return undefined;
			}
			if (!quote && braces === 0 && brackets === 0 && parentheses === 0) return match[1];
			return undefined;
		}
		if (tagStart === 0) break;
		tagStart = text.lastIndexOf('<', tagStart - 1);
	}
	return undefined;
}

/**
 * VS Code's built-in TypeScript extension limits JSX tag closing to its own
 * language identifiers. TSRX owns a custom identifier, so provide the same
 * editor affordance without starting another parser or language service.
 *
 * @param {typeof import('vscode')} vscode
 * @param {import('vscode').ExtensionContext} context
 */
function registerOctaneTagClosing(vscode, context) {
	/** @type {NodeJS.Timeout | undefined} */
	let pending;
	const subscription = vscode.workspace.onDidChangeTextDocument((event) => {
		const editor = vscode.window.activeTextEditor;
		if (
			!editor ||
			editor.document !== event.document ||
			event.document.languageId !== OCTANE_TSRX_LANGUAGE_ID ||
			!vscode.workspace.getConfiguration().get(AUTO_CLOSING_CONFIGURATION, true)
		) {
			return;
		}
		const change = event.contentChanges.at(-1);
		if (!change || change.rangeLength !== 0 || !change.text.endsWith('>')) return;

		if (pending) clearTimeout(pending);
		const version = event.document.version;
		const offset = change.rangeOffset + change.text.length;
		pending = setTimeout(async () => {
			pending = undefined;
			const activeEditor = vscode.window.activeTextEditor;
			if (
				!activeEditor ||
				activeEditor.document !== event.document ||
				event.document.version !== version
			) {
				return;
			}
			const tag = findOpeningTagAtOffset(event.document.getText(), offset);
			if (!tag) return;
			const position = event.document.positionAt(offset);
			if (event.document.getText().slice(offset).startsWith(`</${tag}>`)) return;
			const snippet = new vscode.SnippetString();
			snippet.appendPlaceholder('', 0);
			snippet.appendText(`</${tag}>`);
			await activeEditor.insertSnippet(snippet, position);
		}, 100);
	});
	context.subscriptions.push(
		subscription,
		new vscode.Disposable(() => {
			if (pending) clearTimeout(pending);
		}),
	);
	return subscription;
}

module.exports = {
	AUTO_CLOSING_CONFIGURATION,
	findOpeningTagAtOffset,
	registerOctaneTagClosing,
};
