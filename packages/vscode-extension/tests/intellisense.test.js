import { describe, expect, it, vi } from 'vitest';
import {
	OCTANE_TSRX_LANGUAGE_ID,
	registerOctaneIntelliSense,
	toCompletionItemKind,
} from '../src/intellisense.cjs';

function createVscode(entries = []) {
	let provider;
	class CompletionItem {
		constructor(label, kind) {
			Object.assign(this, { label, kind });
		}
	}
	class CompletionList {
		constructor(items, isIncomplete) {
			Object.assign(this, { isIncomplete, items });
		}
	}
	class SnippetString {
		constructor(value) {
			this.value = value;
		}
	}
	class Range {
		constructor(startLine, startCharacter, endLine, endCharacter) {
			Object.assign(this, { endCharacter, endLine, startCharacter, startLine });
		}
	}
	const disposable = { dispose: vi.fn() };
	const vscode = {
		commands: {
			executeCommand: vi.fn(async () => ({
				body: { entries, isIncomplete: false },
				type: 'response',
			})),
			registerCommand: vi.fn(() => disposable),
		},
		CompletionItem,
		CompletionItemKind: {
			Class: 1,
			Method: 2,
			Property: 3,
			Reference: 4,
			Snippet: 5,
			Text: 6,
		},
		CompletionList,
		languages: {
			registerCompletionItemProvider: vi.fn((selector, value) => {
				provider = value;
				return disposable;
			}),
		},
		Range,
		SnippetString,
		window: {
			activeTextEditor: undefined,
			showInformationMessage: vi.fn(),
			showWarningMessage: vi.fn(),
		},
		workspace: {
			onDidOpenTextDocument: vi.fn(() => disposable),
		},
	};
	return { provider: () => provider, vscode };
}

describe('Octane IntelliSense bridge', () => {
	it('registers only for the owned TSRX language and reuses tsserver completions', async () => {
		const entries = [
			{
				kind: 'method',
				name: 'toUpperCase',
				replacementSpan: {
					end: { line: 3, offset: 8 },
					start: { line: 3, offset: 8 },
				},
				sortText: '11',
			},
		];
		const mock = createVscode(entries);
		const context = { subscriptions: [] };
		registerOctaneIntelliSense(mock.vscode, context);

		expect(mock.vscode.languages.registerCompletionItemProvider).toHaveBeenCalledWith(
			[
				{ language: OCTANE_TSRX_LANGUAGE_ID, scheme: 'file' },
				{ language: OCTANE_TSRX_LANGUAGE_ID, scheme: 'untitled' },
			],
			expect.any(Object),
			'.',
			'"',
			"'",
			'/',
			'@',
		);
		expect(context.subscriptions).toHaveLength(3);

		const result = await mock
			.provider()
			.provideCompletionItems(
				{ uri: { path: '/workspace/App.tsrx' } },
				{ character: 7, line: 2 },
				{ isCancellationRequested: false },
				{ triggerCharacter: '.', triggerKind: 1 },
			);
		expect(mock.vscode.commands.executeCommand).toHaveBeenCalledWith(
			'typescript.tsserverRequest',
			'completionInfo',
			{
				file: { path: '/workspace/App.tsrx' },
				line: 3,
				offset: 8,
				triggerCharacter: '.',
				triggerKind: 2,
			},
		);
		expect(result.items).toEqual([
			expect.objectContaining({
				kind: mock.vscode.CompletionItemKind.Method,
				label: 'toUpperCase',
				range: { endCharacter: 7, endLine: 2, startCharacter: 7, startLine: 2 },
				sortText: '11',
			}),
		]);
	});

	it('offers TSRX control-flow snippets immediately after @ without calling tsserver', async () => {
		const mock = createVscode();
		registerOctaneIntelliSense(mock.vscode, { subscriptions: [] });
		const document = {
			lineAt: () => ({ text: '\t@' }),
			uri: { path: '/workspace/App.tsrx' },
		};

		const result = await mock
			.provider()
			.provideCompletionItems(
				document,
				{ character: 2, line: 4 },
				{ isCancellationRequested: false },
				{ triggerCharacter: '@', triggerKind: 1 },
			);

		expect(result.items.map((item) => item.label)).toEqual([
			'@if',
			'@ifelse',
			'@else',
			'@for',
			'@forempty',
			'@empty',
			'@switch',
			'@case',
			'@default',
			'@try',
			'@pending',
			'@catch',
		]);
		expect(result.items[0]).toEqual(
			expect.objectContaining({
				insertText: { value: '@if (${1:condition}) {\n\t$0\n}' },
				kind: mock.vscode.CompletionItemKind.Snippet,
				range: { endCharacter: 2, endLine: 4, startCharacter: 1, startLine: 4 },
			}),
		);
		expect(result.items.find((item) => item.label === '@case').insertText.value).toBe(
			'@case ${1:value}: {\n\t$0\n}',
		);
		expect(result.items.find((item) => item.label === '@default').insertText.value).toBe(
			'@default: {\n\t$0\n}',
		);
		expect(result.items.find((item) => item.label === '@ifelse').insertText.value).toBe(
			'@if (${1:condition}) {\n\t${2:content}\n} @else {\n\t$0\n}',
		);
		expect(result.items.find((item) => item.label === '@forempty').insertText.value).toBe(
			'@for (const ${1:item} of ${2:items}; key ${1:item}.id) {\n\t${3:content}\n} @empty {\n\t$0\n}',
		);
		expect(mock.vscode.commands.executeCommand).not.toHaveBeenCalled();
	});

	it('replaces a partially typed control-flow directive', async () => {
		const mock = createVscode();
		registerOctaneIntelliSense(mock.vscode, { subscriptions: [] });

		const result = await mock
			.provider()
			.provideCompletionItems(
				{ lineAt: () => ({ text: '  @sw' }), uri: {} },
				{ character: 5, line: 0 },
				{ isCancellationRequested: false },
				{ triggerKind: 0 },
			);

		expect(result.items.find((item) => item.label === '@switch').range).toEqual({
			endCharacter: 5,
			endLine: 0,
			startCharacter: 2,
			startLine: 0,
		});
		expect(mock.vscode.commands.executeCommand).not.toHaveBeenCalled();
	});

	it('avoids work for cancelled requests and safely maps unknown kinds', async () => {
		const mock = createVscode();
		registerOctaneIntelliSense(mock.vscode, { subscriptions: [] });

		expect(toCompletionItemKind(mock.vscode, 'unknown')).toBe(mock.vscode.CompletionItemKind.Text);
		expect(
			await mock
				.provider()
				.provideCompletionItems(
					{ uri: {} },
					{ character: 0, line: 0 },
					{ isCancellationRequested: true },
					{ triggerKind: 0 },
				),
		).toBeUndefined();
		expect(mock.vscode.commands.executeCommand).not.toHaveBeenCalled();
	});

	it('restarts tsserver once when a TSRX document activates a hot-installed plugin', () => {
		const mock = createVscode();
		mock.vscode.window.activeTextEditor = {
			document: { languageId: OCTANE_TSRX_LANGUAGE_ID },
		};
		registerOctaneIntelliSense(mock.vscode, { subscriptions: [] });

		expect(mock.vscode.commands.executeCommand).toHaveBeenCalledWith('typescript.restartTsServer');
	});
});
