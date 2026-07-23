'use strict';

const OCTANE_TSRX_LANGUAGE_ID = 'octane-tsrx';

/** @type {Readonly<Record<string, keyof typeof import('vscode').CompletionItemKind>>} */
const TSSERVER_COMPLETION_KINDS = Object.freeze({
	alias: 'Reference',
	class: 'Class',
	const: 'Constant',
	enum: 'Enum',
	'enum member': 'EnumMember',
	function: 'Function',
	getter: 'Property',
	interface: 'Interface',
	'JSX attribute': 'Property',
	keyword: 'Keyword',
	let: 'Variable',
	method: 'Method',
	module: 'Module',
	primitive: 'Value',
	property: 'Property',
	setter: 'Property',
	type: 'TypeParameter',
	var: 'Variable',
	warning: 'Text',
});

/**
 * @typedef {{
 *   name: string,
 *   kind: string,
 *   source?: string,
 *   sourceDisplay?: Array<{ text: string }>,
 *   filterText?: string,
 *   insertText?: string,
 *   sortText?: string,
 *   replacementSpan?: { start: { line: number, offset: number }, end: { line: number, offset: number } }
 * }} TsCompletionEntry
 */

/**
 * @param {typeof import('vscode')} vscode
 * @param {string} kind
 * @returns {import('vscode').CompletionItemKind}
 */
function toCompletionItemKind(vscode, kind) {
	if (kind === 'constructor') return vscode.CompletionItemKind.Constructor;
	const vscodeKind = TSSERVER_COMPLETION_KINDS[kind];
	return vscode.CompletionItemKind[vscodeKind ?? 'Text'];
}

/**
 * @param {typeof import('vscode')} vscode
 * @param {{ start: { line: number, offset: number }, end: { line: number, offset: number } }} span
 */
function toRange(vscode, span) {
	return new vscode.Range(
		span.start.line - 1,
		span.start.offset - 1,
		span.end.line - 1,
		span.end.offset - 1,
	);
}

/**
 * VS Code's TypeScript extension loads the TSRX tsserver plugin, but does not
 * register its completion UI for custom language identifiers. This small bridge
 * reuses that same tsserver session; it does not parse files or start a second
 * language service.
 *
 * @param {typeof import('vscode')} vscode
 * @param {import('vscode').ExtensionContext} context
 */
function registerOctaneIntelliSense(vscode, context) {
	const provider = vscode.languages.registerCompletionItemProvider(
		[
			{ language: OCTANE_TSRX_LANGUAGE_ID, scheme: 'file' },
			{ language: OCTANE_TSRX_LANGUAGE_ID, scheme: 'untitled' },
		],
		{
			/**
			 * @param {import('vscode').TextDocument} document
			 * @param {import('vscode').Position} position
			 * @param {import('vscode').CancellationToken} token
			 * @param {import('vscode').CompletionContext} completionContext
			 */
			async provideCompletionItems(document, position, token, completionContext) {
				if (token.isCancellationRequested) return undefined;
				/** @type {any} */
				const response = await vscode.commands.executeCommand(
					'typescript.tsserverRequest',
					'completionInfo',
					{
						file: document.uri,
						line: position.line + 1,
						offset: position.character + 1,
						triggerCharacter: completionContext.triggerCharacter,
						triggerKind: completionContext.triggerKind + 1,
					},
				);
				const body = response?.type === 'response' ? response.body : undefined;
				if (!body || !Array.isArray(body.entries) || token.isCancellationRequested) {
					return undefined;
				}

				/** @type {TsCompletionEntry[]} */
				const entries = body.entries;
				const items = entries.map((entry) => {
					const item = new vscode.CompletionItem(
						entry.name,
						toCompletionItemKind(vscode, entry.kind),
					);
					item.detail = entry.sourceDisplay?.map((part) => part.text).join('') ?? entry.source;
					item.filterText = entry.filterText;
					item.insertText = entry.insertText;
					item.sortText = entry.sortText;
					if (entry.replacementSpan) item.range = toRange(vscode, entry.replacementSpan);
					return item;
				});
				return new vscode.CompletionList(items, Boolean(body.isIncomplete));
			},
		},
		'.',
		'"',
		"'",
		'/',
	);
	let restartRequested = false;
	/** @param {import('vscode').TextDocument | undefined} document */
	const ensurePluginLoaded = (document) => {
		if (restartRequested || document?.languageId !== OCTANE_TSRX_LANGUAGE_ID) return;
		restartRequested = true;
		void vscode.commands.executeCommand('typescript.restartTsServer');
	};
	const documentListener = vscode.workspace.onDidOpenTextDocument(ensurePluginLoaded);
	const checkCommand = vscode.commands.registerCommand('octane.intellisense.check', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== OCTANE_TSRX_LANGUAGE_ID) {
			await vscode.window.showWarningMessage('Open a .tsrx file to test Octane IntelliSense.');
			return;
		}
		const position = editor.selection.active;
		/** @type {any} */
		const response = await vscode.commands.executeCommand(
			'typescript.tsserverRequest',
			'quickinfo',
			{
				file: editor.document.uri,
				line: position.line + 1,
				offset: position.character + 1,
			},
		);
		if (response?.type === 'response' && response.body?.displayString) {
			await vscode.window.showInformationMessage(
				`Octane IntelliSense is working: ${response.body.displayString.split('\n')[0]}`,
			);
			return;
		}
		restartRequested = true;
		await vscode.commands.executeCommand('typescript.restartTsServer');
		await vscode.window.showWarningMessage(
			'Octane restarted the TypeScript server. Place the cursor on a symbol and try again.',
		);
	});
	context.subscriptions.push(provider, documentListener, checkCommand);
	ensurePluginLoaded(vscode.window.activeTextEditor?.document);
	return provider;
}

module.exports = {
	OCTANE_TSRX_LANGUAGE_ID,
	registerOctaneIntelliSense,
	toCompletionItemKind,
};
