import { describe, expect, it, vi } from 'vitest';
import {
	OCTANE_TSRX_LANGUAGE_ID,
	OCTANE_VIEW_ID,
	createViewState,
	registerOctaneStatusView,
	renderDashboard,
} from '../src/status-view.cjs';

function createVscode({ enabled = true } = {}) {
	const commands = new Map();
	const messageHandlers = new Set();
	let disposeViewHandler;
	let registeredProvider;
	const htmlWrites = [];
	const configuration = {
		get: vi.fn(() => enabled),
		update: vi.fn(),
	};
	const disposable = () => ({ dispose: vi.fn() });
	const vscode = {
		commands: {
			executeCommand: vi.fn(),
			registerCommand: vi.fn((id, handler) => {
				commands.set(id, handler);
				return disposable();
			}),
		},
		ConfigurationTarget: { Global: 1 },
		env: { openExternal: vi.fn() },
		Uri: {
			joinPath: vi.fn((base, ...segments) => ({ path: [base.path, ...segments].join('/') })),
			parse: vi.fn((value) => ({ value })),
		},
		window: {
			activeTextEditor: {
				document: {
					languageId: OCTANE_TSRX_LANGUAGE_ID,
					uri: { fsPath: '/workspace/App.tsrx' },
				},
			},
			onDidChangeActiveTextEditor: vi.fn(disposable),
			registerWebviewViewProvider: vi.fn((_id, provider) => {
				registeredProvider = provider;
				return disposable();
			}),
		},
		workspace: {
			getConfiguration: vi.fn(() => configuration),
			onDidChangeConfiguration: vi.fn(disposable),
		},
	};
	let html = '';
	const webview = {
		asWebviewUri: vi.fn((uri) => `webview:${uri.path}`),
		cspSource: 'webview-source',
		get html() {
			return html;
		},
		set html(value) {
			html = value;
			htmlWrites.push(value);
		},
		onDidReceiveMessage: vi.fn((handler) => {
			messageHandlers.add(handler);
			return { dispose: vi.fn(() => messageHandlers.delete(handler)) };
		}),
		options: {},
	};
	const webviewView = {
		onDidDispose: vi.fn((handler) => {
			disposeViewHandler = handler;
			return disposable();
		}),
		webview,
	};
	return {
		commands,
		configuration,
		disposeView: () => disposeViewHandler?.(),
		emitMessage: async (message) => {
			for (const handler of [...messageHandlers]) await handler(message);
		},
		htmlWrites,
		provider: () => registeredProvider,
		vscode,
		webview,
		webviewView,
	};
}

describe('Octane dashboard view', () => {
	it('centers the official logo and exposes every direct Octane action', () => {
		const mock = createVscode();
		const html = renderDashboard(mock.vscode, mock.webview, { path: '/extension' });

		expect(html).toContain('class="logo-stage"');
		expect(html).toContain('webview:/extension/assets/octane-icon.svg');
		expect(html).toContain('TSRX IntelliSense ready');
		for (const command of [
			'octane.mcp.compileActive',
			'octane.mcp.searchDocs',
			'octane.mcp.bindingStatus',
			'octane.mcp.bridgeScan',
			'octane.mcp.loadSkill',
			'octane.intellisense.check',
		]) {
			expect(html).toContain(`data-command="${command}"`);
		}
		expect(html).toContain("default-src 'none'");
	});

	it('registers a webview, accepts only allowlisted commands, and toggles MCP', async () => {
		const mock = createVscode();
		const context = { extensionUri: { path: '/extension' }, subscriptions: [] };
		const provider = registerOctaneStatusView(mock.vscode, context);

		expect(mock.vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
			OCTANE_VIEW_ID,
			provider,
		);
		provider.resolveWebviewView(mock.webviewView);
		expect(mock.webview.options).toEqual({
			enableScripts: true,
			localResourceRoots: [{ path: '/extension/assets' }],
		});

		await mock.emitMessage({ command: 'octane.mcp.compileActive' });
		await mock.emitMessage({ command: 'malicious.command' });
		expect(mock.vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
		expect(mock.vscode.commands.executeCommand).toHaveBeenCalledWith('octane.mcp.compileActive');

		await mock.commands.get('octane.mcp.toggle')();
		expect(mock.configuration.update).toHaveBeenCalledWith('enabled', false, 1);
	});

	it('stops rendering and receiving commands after the webview is disposed', async () => {
		const mock = createVscode();
		const context = { extensionUri: { path: '/extension' }, subscriptions: [] };
		const provider = registerOctaneStatusView(mock.vscode, context);
		provider.resolveWebviewView(mock.webviewView);

		expect(mock.htmlWrites).toHaveLength(1);
		mock.disposeView();
		await mock.emitMessage({ command: 'octane.mcp.compileActive' });
		await mock.commands.get('octane.refresh')();

		expect(mock.vscode.commands.executeCommand).not.toHaveBeenCalled();
		expect(mock.htmlWrites).toHaveLength(1);
	});

	it('surfaces a wrong language mode for a .tsrx file', () => {
		const mock = createVscode();
		mock.vscode.window.activeTextEditor.document.languageId = 'typescriptreact';

		expect(createViewState(mock.vscode)).toMatchObject({
			languageDescription: 'Wrong language mode',
			languageStatus: 'warning',
		});
	});
});
