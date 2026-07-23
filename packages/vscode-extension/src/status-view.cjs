'use strict';

const { randomBytes } = require('node:crypto');
const {
	MCP_CONFIGURATION_SECTION,
	MCP_ENABLED_SETTING,
	OCTANE_MCP_ENDPOINT,
} = require('./mcp-provider.cjs');

const OCTANE_VIEW_ID = 'octane.overview';
const OCTANE_TSRX_LANGUAGE_ID = 'octane-tsrx';
const WEBVIEW_COMMANDS = new Set([
	'octane.intellisense.check',
	'octane.mcp.bindingStatus',
	'octane.mcp.bridgeScan',
	'octane.mcp.compileActive',
	'octane.mcp.loadSkill',
	'octane.mcp.searchDocs',
	'octane.mcp.toggle',
	'octane.openMcpEndpoint',
	'octane.openSettings',
	'octane.restartLanguageServer',
]);

/** @param {typeof import('vscode')} vscode */
function createViewState(vscode) {
	const activeDocument = vscode.window.activeTextEditor?.document;
	const isTsrxFile = activeDocument?.uri.fsPath.endsWith('.tsrx') === true;
	const ownsActiveFile = !isTsrxFile || activeDocument.languageId === OCTANE_TSRX_LANGUAGE_ID;
	return {
		isTsrxFile,
		languageDescription: !ownsActiveFile
			? 'Wrong language mode'
			: isTsrxFile
				? 'TSRX IntelliSense ready'
				: 'Ready for .tsrx files',
		languageStatus: ownsActiveFile ? (isTsrxFile ? 'ready' : 'idle') : 'warning',
		mcpEnabled: vscode.workspace
			.getConfiguration(MCP_CONFIGURATION_SECTION)
			.get(MCP_ENABLED_SETTING, true),
	};
}

/**
 * @param {typeof import('vscode')} vscode
 * @param {import('vscode').Webview} webview
 * @param {import('vscode').Uri} extensionUri
 */
function renderDashboard(vscode, webview, extensionUri) {
	const state = createViewState(vscode);
	const nonce = randomBytes(16).toString('base64');
	const logoUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'assets', 'octane-icon.svg'),
	);
	const mcpLabel = state.mcpEnabled ? 'MCP enabled for agents' : 'MCP disabled for agents';
	const mcpAction = state.mcpEnabled ? 'Disable agent MCP' : 'Enable agent MCP';
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0 14px 22px;
      color: var(--vscode-foreground);
      background: transparent;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .hero { text-align: center; padding: 22px 0 18px; }
    .logo-stage {
      display: grid;
      place-items: center;
      width: 104px;
      height: 104px;
      margin: 0 auto 12px;
      border: 1px solid color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
      border-radius: 28px;
      background: radial-gradient(circle at 50% 42%, #2d2528 0, #16181d 68%, #111318 100%);
      box-shadow: 0 10px 30px color-mix(in srgb, #000 28%, transparent);
    }
    .logo { width: 76px; height: 76px; display: block; }
    h1 { margin: 0; font-size: 20px; line-height: 1.25; font-weight: 650; }
    .tagline { margin: 5px auto 12px; max-width: 260px; color: var(--vscode-descriptionForeground); line-height: 1.4; }
    .status-row { display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 999px;
      color: var(--vscode-descriptionForeground);
      background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
      font-size: 11px;
    }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--vscode-charts-green); }
    .status.warning .dot { background: var(--vscode-charts-yellow); }
    .status.idle .dot { background: var(--vscode-descriptionForeground); }
    .section-title {
      margin: 7px 2px 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-weight: 650;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .actions { display: grid; gap: 7px; }
    button {
      width: 100%;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 7px;
      padding: 9px 10px;
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
    button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    .action-title { display: block; font-weight: 600; line-height: 1.25; }
    .action-detail { display: block; margin-top: 3px; color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.3; }
    button.primary .action-detail { color: color-mix(in srgb, var(--vscode-button-foreground) 75%, transparent); }
    .utilities { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 7px; }
    .utilities button { text-align: center; padding: 7px 6px; font-size: 11px; }
    .divider { height: 1px; margin: 15px 0 12px; background: color-mix(in srgb, var(--vscode-foreground) 10%, transparent); }
    .footer { text-align: center; color: var(--vscode-descriptionForeground); font-size: 10px; margin-top: 12px; }
  </style>
</head>
<body>
  <header class="hero">
    <div class="logo-stage"><img class="logo" src="${logoUri}" alt="Octane"></div>
    <h1>Octane</h1>
    <p class="tagline">TSRX intelligence and framework superpowers, directly in VS Code.</p>
    <div class="status-row">
      <span class="status ${state.languageStatus}"><span class="dot"></span>${state.languageDescription}</span>
      <span class="status ${state.mcpEnabled ? 'ready' : 'idle'}"><span class="dot"></span>${mcpLabel}</span>
    </div>
  </header>

  <div class="section-title">Octane MCP tools</div>
  <main class="actions">
    <button class="primary" data-command="octane.mcp.compileActive">
      <span class="action-title">Compile active file</span>
      <span class="action-detail">Validate TSRX and inspect client or SSR output</span>
    </button>
    <button data-command="octane.mcp.searchDocs">
      <span class="action-title">Search documentation</span>
      <span class="action-detail">Search official Octane docs and open an exact section</span>
    </button>
    <button data-command="octane.mcp.bindingStatus">
      <span class="action-title">Inspect a binding</span>
      <span class="action-detail">Check parity, supported APIs, SSR, and known divergences</span>
    </button>
    <button data-command="octane.mcp.bridgeScan">
      <span class="action-title">Scan React compatibility</span>
      <span class="action-detail">Analyze the selection or active file for an Octane migration</span>
    </button>
    <button data-command="octane.mcp.loadSkill">
      <span class="action-title">Open an Octane skill</span>
      <span class="action-detail">Architecture, migrations, React differences, and SSR guidance</span>
    </button>
  </main>

  <div class="divider"></div>
  <div class="section-title">Developer tools</div>
  <div class="actions">
    <button data-command="octane.intellisense.check">
      <span class="action-title">Test IntelliSense at cursor</span>
      <span class="action-detail">Verify the exact type returned by the TSRX language service</span>
    </button>
  </div>
  <div class="utilities">
    <button data-command="octane.restartLanguageServer">Restart language service</button>
    <button data-command="octane.mcp.toggle">${mcpAction}</button>
    <button data-command="octane.openMcpEndpoint">Open MCP endpoint</button>
    <button data-command="octane.openSettings">Settings</button>
  </div>
  <div class="footer">Official Octane MCP · no sign-in required</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-command]');
      if (button) vscode.postMessage({ command: button.dataset.command });
    });
  </script>
</body>
</html>`;
}

/**
 * @param {typeof import('vscode')} vscode
 * @param {import('vscode').ExtensionContext} context
 */
function registerOctaneStatusView(vscode, context) {
	/** @type {import('vscode').WebviewView | undefined} */
	let currentView;
	const render = () => {
		if (currentView) {
			currentView.webview.html = renderDashboard(vscode, currentView.webview, context.extensionUri);
		}
	};
	const provider = {
		/** @param {import('vscode').WebviewView} webviewView */
		resolveWebviewView(webviewView) {
			currentView = webviewView;
			webviewView.webview.options = {
				enableScripts: true,
				localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'assets')],
			};
			const messageListener = webviewView.webview.onDidReceiveMessage(async (message) => {
				if (typeof message?.command === 'string' && WEBVIEW_COMMANDS.has(message.command)) {
					await vscode.commands.executeCommand(message.command);
				}
			});
			webviewView.onDidDispose(() => {
				messageListener.dispose();
				if (currentView === webviewView) currentView = undefined;
			});
			render();
		},
	};

	const subscriptions = [
		vscode.window.registerWebviewViewProvider(OCTANE_VIEW_ID, provider),
		vscode.window.onDidChangeActiveTextEditor(render),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(MCP_CONFIGURATION_SECTION)) render();
		}),
		vscode.commands.registerCommand('octane.refresh', render),
		vscode.commands.registerCommand('octane.mcp.toggle', async () => {
			const configuration = vscode.workspace.getConfiguration(MCP_CONFIGURATION_SECTION);
			const enabled = configuration.get(MCP_ENABLED_SETTING, true);
			await configuration.update(MCP_ENABLED_SETTING, !enabled, vscode.ConfigurationTarget.Global);
		}),
		vscode.commands.registerCommand('octane.openSettings', () =>
			vscode.commands.executeCommand(
				'workbench.action.openSettings',
				'@ext:octanejs.octane-vscode',
			),
		),
		vscode.commands.registerCommand('octane.openMcpEndpoint', () =>
			vscode.env.openExternal(vscode.Uri.parse(OCTANE_MCP_ENDPOINT)),
		),
		vscode.commands.registerCommand('octane.restartLanguageServer', () =>
			vscode.commands.executeCommand('typescript.restartTsServer'),
		),
	];

	context.subscriptions.push(...subscriptions);
	return provider;
}

module.exports = {
	OCTANE_VIEW_ID,
	OCTANE_TSRX_LANGUAGE_ID,
	WEBVIEW_COMMANDS,
	createViewState,
	registerOctaneStatusView,
	renderDashboard,
};
