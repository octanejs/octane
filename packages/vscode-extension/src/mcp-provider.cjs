'use strict';

const MCP_PROVIDER_ID = 'octane.remoteMcp';
const MCP_CONFIGURATION_SECTION = 'octane.mcp';
const MCP_ENABLED_SETTING = 'enabled';
const MCP_ENABLED_CONFIGURATION = `${MCP_CONFIGURATION_SECTION}.${MCP_ENABLED_SETTING}`;
const OCTANE_MCP_ENDPOINT = 'https://mcp.octanejs.dev/v1/mcp';
const OCTANE_MCP_VERSION = '1.0.0';

/**
 * Register the Octane MCP definition without connecting to the network. VS Code
 * owns transport startup, trust, tool discovery, cancellation, and teardown.
 *
 * The URI and definition are allocated once. Provider reads are a cold path
 * when agents discover tools; they receive a fresh one-item array because the
 * VS Code contract exposes a mutable collection to the host.
 *
 * @param {typeof import('vscode')} vscode
 * @param {import('vscode').ExtensionContext} context
 * @returns {import('vscode').McpServerDefinitionProvider<import('vscode').McpHttpServerDefinition>}
 */
function registerOctaneMcpProvider(vscode, context) {
	if (typeof vscode.lm?.registerMcpServerDefinitionProvider !== 'function') {
		throw new Error('Octane MCP requires a VS Code version with the stable MCP extension API.');
	}

	const definition = new vscode.McpHttpServerDefinition(
		'Octane',
		vscode.Uri.parse(OCTANE_MCP_ENDPOINT),
		{},
		OCTANE_MCP_VERSION,
	);
	/** @type {import('vscode').EventEmitter<void>} */
	const didChange = new vscode.EventEmitter();

	/** @type {import('vscode').McpServerDefinitionProvider<import('vscode').McpHttpServerDefinition>} */
	const provider = {
		onDidChangeMcpServerDefinitions: didChange.event,
		provideMcpServerDefinitions(_token) {
			return vscode.workspace
				.getConfiguration(MCP_CONFIGURATION_SECTION)
				.get(MCP_ENABLED_SETTING, true)
				? [definition]
				: [];
		},
		resolveMcpServerDefinition(server, _token) {
			return server;
		},
	};

	const configurationSubscription = vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration(MCP_ENABLED_CONFIGURATION)) {
			didChange.fire();
		}
	});
	const providerSubscription = vscode.lm.registerMcpServerDefinitionProvider(
		MCP_PROVIDER_ID,
		provider,
	);

	context.subscriptions.push(didChange, configurationSubscription, providerSubscription);
	return provider;
}

module.exports = {
	MCP_CONFIGURATION_SECTION,
	MCP_ENABLED_SETTING,
	MCP_ENABLED_CONFIGURATION,
	MCP_PROVIDER_ID,
	OCTANE_MCP_ENDPOINT,
	OCTANE_MCP_VERSION,
	registerOctaneMcpProvider,
};
