'use strict';

const vscode = require('vscode');
const { registerOctaneIntelliSense } = require('./intellisense.cjs');
const { registerOctaneMcpActions } = require('./mcp-actions.cjs');
const { registerOctaneMcpProvider } = require('./mcp-provider.cjs');
const { registerOctaneResultViewer } = require('./result-viewer.cjs');
const { registerOctaneStatusView } = require('./status-view.cjs');
const { registerOctaneTagClosing } = require('./tag-closing.cjs');

/**
 * The manifest wires the generic TSRX TypeScript plugin directly into VS Code.
 * Activation stays intentionally small: language work remains inside tsserver,
 * while this process owns only Octane MCP and the framework status surface.
 *
 * @param {import('vscode').ExtensionContext} context
 */
function activate(context) {
	registerOctaneIntelliSense(vscode, context);
	registerOctaneTagClosing(vscode, context);
	registerOctaneMcpProvider(vscode, context);
	const resultViewer = registerOctaneResultViewer(vscode, context);
	registerOctaneMcpActions(vscode, context, undefined, resultViewer);
	registerOctaneStatusView(vscode, context);
}

module.exports = { activate };
