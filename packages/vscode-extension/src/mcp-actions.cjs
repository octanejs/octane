'use strict';

const path = require('node:path');
const { callOctaneMcpTool } = require('./mcp-client.cjs');

const OCTANE_SKILLS = [
	'build-octane-software',
	'bridge-react-package',
	'migrate-react-component',
	'react-divergences',
	'setup-ssr',
];

/** @param {typeof import('vscode')} vscode @param {string} content @param {string} language */
async function showResult(vscode, content, language) {
	const document = await vscode.workspace.openTextDocument({ content, language });
	await vscode.window.showTextDocument(document, { preview: true });
}

/**
 * @param {typeof import('vscode')} vscode
 * @param {string} title
 * @param {(signal: AbortSignal) => Promise<void>} action
 */
async function withMcpProgress(vscode, title, action) {
	try {
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title, cancellable: true },
			async (_progress, token) => {
				const controller = new AbortController();
				const cancellation = token.onCancellationRequested(() => controller.abort());
				try {
					await action(controller.signal);
				} finally {
					cancellation.dispose();
				}
			},
		);
	} catch (error) {
		if (!(error instanceof Error) || error.name !== 'AbortError') {
			await vscode.window.showErrorMessage(
				`Octane MCP: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}

/** @param {typeof import('vscode')} vscode */
function activeSource(vscode) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return undefined;
	const selection = editor.document.getText(editor.selection);
	return {
		document: editor.document,
		source: selection.trim() ? selection : editor.document.getText(),
	};
}

/**
 * @param {typeof import('vscode')} vscode
 * @param {import('vscode').ExtensionContext} context
 * @param {typeof callOctaneMcpTool} [callTool]
 * @param {{ showCompiledCode(code: string): Promise<void> }} [resultViewer]
 */
function registerOctaneMcpActions(vscode, context, callTool = callOctaneMcpTool, resultViewer) {
	const commands = [
		vscode.commands.registerCommand('octane.mcp.compileActive', async () => {
			const active = activeSource(vscode);
			if (!active || !/\.(?:tsrx|tsx|jsx)$/.test(active.document.uri.fsPath)) {
				await vscode.window.showWarningMessage('Open an Octane .tsrx, .tsx, or .jsx file first.');
				return;
			}
			const mode = await vscode.window.showQuickPick(
				[
					{ label: 'Client', value: 'client' },
					{ label: 'Server (SSR)', value: 'server' },
				],
				{ placeHolder: 'Choose the Octane compiler target' },
			);
			if (!mode) return;
			await withMcpProgress(vscode, 'Compiling with Octane MCP…', async (signal) => {
				const result = await callTool(
					'octane_compile',
					{
						filename: path.basename(active.document.uri.fsPath),
						mode: mode.value,
						source: active.source,
					},
					{ signal },
				);
				/** @type {{ ok?: boolean, code?: string, octaneVersion?: string, warnings?: unknown[] }} */
				const payload = JSON.parse(result);
				if (payload.ok && typeof payload.code === 'string' && resultViewer) {
					await resultViewer.showCompiledCode(payload.code);
					const warningCount = Array.isArray(payload.warnings) ? payload.warnings.length : 0;
					const version = payload.octaneVersion ? ` with Octane ${payload.octaneVersion}` : '';
					const warnings = warningCount
						? ` (${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'})`
						: '';
					const message = `Compiled ${path.basename(active.document.uri.fsPath)} for ${mode.value}${version}${warnings}.`;
					if (warningCount) {
						await vscode.window.showWarningMessage(message);
					} else {
						await vscode.window.showInformationMessage(message);
					}
					return;
				}
				await showResult(vscode, result, 'json');
			});
		}),
		vscode.commands.registerCommand('octane.mcp.searchDocs', async () => {
			const query = await vscode.window.showInputBox({
				prompt: 'Search the official Octane documentation',
				placeHolder: 'Suspense, SSR, conditional hooks…',
				validateInput: (value) =>
					value.trim().length >= 2 ? undefined : 'Enter at least two characters.',
			});
			if (!query) return;
			await withMcpProgress(vscode, 'Searching Octane docs…', async (signal) => {
				const raw = await callTool(
					'octane_docs_search',
					{ query: query.trim(), limit: 10 },
					{ signal },
				);
				/** @type {{ results: Array<{ title: string, docTitle: string, url: string, lines?: Array<{ text: string }> }> }} */
				const payload = JSON.parse(raw);
				/** @type {Array<{ label: string, description: string, detail: string | undefined, url: string }>} */
				const items = payload.results.map((result) => ({
					label: result.title,
					description: result.docTitle,
					detail: result.lines?.[0]?.text,
					url: result.url,
				}));
				if (!items.length) {
					await vscode.window.showInformationMessage(`No Octane docs found for “${query}”.`);
					return;
				}
				const selected = await vscode.window.showQuickPick(items, {
					placeHolder: `${items.length} Octane documentation results`,
					matchOnDescription: true,
					matchOnDetail: true,
				});
				if (selected) await vscode.env.openExternal(vscode.Uri.parse(selected.url));
			});
		}),
		vscode.commands.registerCommand('octane.mcp.bindingStatus', async () => {
			const packageName = await vscode.window.showInputBox({
				prompt: 'Inspect an Octane binding (leave empty to list every binding)',
				placeHolder: '@tanstack/react-query, @octanejs/zustand…',
			});
			if (packageName === undefined) return;
			await withMcpProgress(vscode, 'Loading Octane binding status…', async (signal) => {
				const args = packageName.trim() ? { package: packageName.trim() } : {};
				await showResult(
					vscode,
					await callTool('octane_bindings_status', args, { signal }),
					'json',
				);
			});
		}),
		vscode.commands.registerCommand('octane.mcp.bridgeScan', async () => {
			const active = activeSource(vscode);
			if (!active) {
				await vscode.window.showWarningMessage(
					'Open a React source file or select React code first.',
				);
				return;
			}
			await withMcpProgress(vscode, 'Scanning React compatibility…', async (signal) => {
				await showResult(
					vscode,
					await callTool('octane_bridge_scan', { source: active.source }, { signal }),
					'json',
				);
			});
		}),
		vscode.commands.registerCommand('octane.mcp.loadSkill', async () => {
			const name = await vscode.window.showQuickPick(OCTANE_SKILLS, {
				placeHolder: 'Choose an Octane MCP skill',
			});
			if (!name) return;
			await withMcpProgress(vscode, `Loading ${name}…`, async (signal) => {
				await showResult(vscode, await callTool('octane_skill', { name }, { signal }), 'markdown');
			});
		}),
	];
	context.subscriptions.push(...commands);
	return commands;
}

module.exports = { OCTANE_SKILLS, registerOctaneMcpActions, showResult, withMcpProgress };
