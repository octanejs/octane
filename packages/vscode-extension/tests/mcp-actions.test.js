import { describe, expect, it, vi } from 'vitest';
import { registerOctaneMcpActions } from '../src/mcp-actions.cjs';

function createVscode() {
	const commands = new Map();
	const source = 'export function App() @{}';
	const selection = '<button>selected fragment</button>';
	const document = {
		getText: vi.fn((range) => (range ? selection : source)),
		uri: { fsPath: '/workspace/App.tsrx' },
	};
	const vscode = {
		commands: {
			registerCommand: vi.fn((name, handler) => {
				commands.set(name, handler);
				return { dispose: vi.fn() };
			}),
		},
		env: { openExternal: vi.fn() },
		ProgressLocation: { Notification: 15 },
		Uri: { parse: vi.fn((value) => ({ value })) },
		window: {
			activeTextEditor: { document, selection: {} },
			showErrorMessage: vi.fn(),
			showInformationMessage: vi.fn(),
			showInputBox: vi.fn(),
			showQuickPick: vi.fn(async () => ({ label: 'Client', value: 'client' })),
			showTextDocument: vi.fn(),
			showWarningMessage: vi.fn(),
			withProgress: vi.fn(async (_options, task) =>
				task(
					{},
					{
						onCancellationRequested: () => ({ dispose: vi.fn() }),
					},
				),
			),
		},
		workspace: {
			openTextDocument: vi.fn(async (options) => ({ options })),
		},
	};
	return { commands, document, vscode };
}

describe('Octane MCP actions', () => {
	it('compiles the complete active TSRX file even when the editor has a selection', async () => {
		const mock = createVscode();
		const callTool = vi.fn(async () =>
			JSON.stringify({
				code: 'export function App() {}',
				octaneVersion: '0.1.0',
				ok: true,
				warnings: [],
			}),
		);
		const resultViewer = { showCompiledCode: vi.fn() };
		const context = { subscriptions: [] };
		registerOctaneMcpActions(mock.vscode, context, callTool, resultViewer);

		expect(context.subscriptions).toHaveLength(5);
		await mock.commands.get('octane.mcp.compileActive')();
		expect(callTool).toHaveBeenCalledWith(
			'octane_compile',
			{
				filename: 'App.tsrx',
				mode: 'client',
				source: 'export function App() @{}',
			},
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(resultViewer.showCompiledCode).toHaveBeenCalledWith('export function App() {}');
		expect(mock.vscode.workspace.openTextDocument).not.toHaveBeenCalled();
		expect(mock.vscode.window.showInformationMessage).toHaveBeenCalledWith(
			'Compiled App.tsrx for client with Octane 0.1.0.',
		);
	});
});
