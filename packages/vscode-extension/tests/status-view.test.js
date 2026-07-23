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
	let messageHandler;
	let registeredProvider;
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
	const webview = {
		asWebviewUri: vi.fn((uri) => `webview:${uri.path}`),
		cspSource: 'webview-source',
		html: '',
		onDidReceiveMessage: vi.fn((handler) => {
			messageHandler = handler;
			return disposable();
		}),
		options: {},
	};
	return {
		commands,
		configuration,
		messageHandler: () => messageHandler,
		provider: () => registeredProvider,
		vscode,
		webview,
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
		provider.resolveWebviewView({ webview: mock.webview });
		expect(mock.webview.options).toEqual({
			enableScripts: true,
			localResourceRoots: [{ path: '/extension/assets' }],
		});

		await mock.messageHandler()({ command: 'octane.mcp.compileActive' });
		await mock.messageHandler()({ command: 'malicious.command' });
		expect(mock.vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
		expect(mock.vscode.commands.executeCommand).toHaveBeenCalledWith('octane.mcp.compileActive');

		await mock.commands.get('octane.mcp.toggle')();
		expect(mock.configuration.update).toHaveBeenCalledWith('enabled', false, 1);
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
