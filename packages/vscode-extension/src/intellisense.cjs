'use strict';

const OCTANE_TSRX_LANGUAGE_ID = 'octane-tsrx';

const TSRX_CONTROL_FLOW = Object.freeze([
	{
		label: '@if',
		detail: 'TSRX conditional block',
		snippet: '@if (${1:condition}) {\n\t$0\n}',
	},
	{
		label: '@ifelse',
		detail: 'TSRX conditional with alternative',
		snippet: '@if (${1:condition}) {\n\t${2:content}\n} @else {\n\t$0\n}',
	},
	{ label: '@else', detail: 'TSRX alternative block', snippet: '@else {\n\t$0\n}' },
	{
		label: '@for',
		detail: 'TSRX keyed iteration block',
		snippet: '@for (const ${1:item} of ${2:items}; key ${1:item}.id) {\n\t$0\n}',
	},
	{
		label: '@forempty',
		detail: 'TSRX keyed iteration with empty state',
		snippet:
			'@for (const ${1:item} of ${2:items}; key ${1:item}.id) {\n\t${3:content}\n} @empty {\n\t$0\n}',
	},
	{ label: '@empty', detail: 'TSRX empty-list block', snippet: '@empty {\n\t$0\n}' },
	{
		label: '@switch',
		detail: 'TSRX switch block',
		snippet:
			'@switch (${1:value}) {\n\t@case ${2:caseValue}: {\n\t\t${3:content}\n\t}\n\t@default: {\n\t\t$0\n\t}\n}',
	},
	{ label: '@case', detail: 'TSRX switch case', snippet: '@case ${1:value}: {\n\t$0\n}' },
	{ label: '@default', detail: 'TSRX default case', snippet: '@default: {\n\t$0\n}' },
	{
		label: '@try',
		detail: 'TSRX async and error boundary',
		snippet:
			'@try {\n\t${1:content}\n} @pending {\n\t${2:pending}\n} @catch (${3:error}) {\n\t$0\n}',
	},
	{ label: '@pending', detail: 'TSRX pending block', snippet: '@pending {\n\t$0\n}' },
	{
		label: '@catch',
		detail: 'TSRX error block',
		snippet: '@catch (${1:error}) {\n\t$0\n}',
	},
]);

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
 * @param {import('vscode').TextDocument} document
 * @param {import('vscode').Position} position
 */
function controlFlowPrefixAt(document, position) {
	const beforeCursor = document.lineAt(position.line).text.slice(0, position.character);
	const match = beforeCursor.match(/@[A-Za-z]*$/);
	if (!match) return undefined;
	const characterBeforeAt = beforeCursor[beforeCursor.length - match[0].length - 1];
	return characterBeforeAt && /[\w$'"`]/.test(characterBeforeAt) ? undefined : match[0];
}

/**
 * @param {typeof import('vscode')} vscode
 * @param {import('vscode').Position} position
 * @param {string} prefix
 */
function createControlFlowCompletionItems(vscode, position, prefix) {
	const range = new vscode.Range(
		position.line,
		position.character - prefix.length,
		position.line,
		position.character,
	);
	return TSRX_CONTROL_FLOW.map((definition, index) => {
		const item = new vscode.CompletionItem(definition.label, vscode.CompletionItemKind.Snippet);
		item.detail = definition.detail;
		item.filterText = definition.label;
		item.insertText = new vscode.SnippetString(definition.snippet);
		item.range = range;
		item.sortText = `0${String(index).padStart(2, '0')}`;
		return item;
	});
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
				const controlFlowPrefix =
					completionContext.triggerCharacter === '@' ||
					completionContext.triggerCharacter === undefined
						? controlFlowPrefixAt(document, position)
						: undefined;
				if (controlFlowPrefix !== undefined) {
					return new vscode.CompletionList(
						createControlFlowCompletionItems(vscode, position, controlFlowPrefix),
						false,
					);
				}
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
		'@',
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
	TSRX_CONTROL_FLOW,
	controlFlowPrefixAt,
	createControlFlowCompletionItems,
	registerOctaneIntelliSense,
	toCompletionItemKind,
};
