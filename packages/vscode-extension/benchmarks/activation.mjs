import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const { registerOctaneIntelliSense } = require('../src/intellisense.cjs');
const { registerOctaneMcpActions } = require('../src/mcp-actions.cjs');
const { registerOctaneMcpProvider } = require('../src/mcp-provider.cjs');
const { registerOctaneStatusView } = require('../src/status-view.cjs');

function createVscode() {
	return {
		commands: {
			executeCommand: () => {},
			registerCommand: () => ({ dispose() {} }),
		},
		languages: {
			registerCompletionItemProvider: () => ({ dispose() {} }),
		},
		ConfigurationTarget: { Global: 1 },
		env: { openExternal: () => {} },
		EventEmitter: class EventEmitter {
			event = () => {};
			fire() {}
			dispose() {}
		},
		McpHttpServerDefinition: class McpHttpServerDefinition {
			constructor(label, uri, headers, version) {
				Object.assign(this, { label, uri, headers, version });
			}
		},
		Uri: {
			joinPath: (base, ...segments) => ({ path: [base.path, ...segments].join('/') }),
			parse: (value) => new URL(value),
		},
		lm: {
			registerMcpServerDefinitionProvider: () => ({ dispose() {} }),
		},
		extensions: {
			getExtension: () => undefined,
			onDidChange: () => ({ dispose() {} }),
		},
		ThemeIcon: class ThemeIcon {},
		TreeItem: class TreeItem {},
		TreeItemCollapsibleState: { None: 0, Expanded: 2 },
		window: {
			activeTextEditor: undefined,
			onDidChangeActiveTextEditor: () => ({ dispose() {} }),
			registerWebviewViewProvider: () => ({ dispose() {} }),
		},
		workspace: {
			getConfiguration: () => ({ get: () => true, update: () => {} }),
			onDidChangeConfiguration: () => ({ dispose() {} }),
			onDidOpenTextDocument: () => ({ dispose() {} }),
		},
	};
}

function measure(iterations) {
	const vscode = createVscode();
	const started = performance.now();
	for (let index = 0; index < iterations; index++) {
		const context = { extensionUri: { path: '/extension' }, subscriptions: [] };
		registerOctaneIntelliSense(vscode, context);
		registerOctaneMcpProvider(vscode, context);
		registerOctaneMcpActions(vscode, context);
		registerOctaneStatusView(vscode, context);
	}
	return performance.now() - started;
}

measure(1_000);
const iterations = 100_000;
const elapsed = measure(iterations);
console.log(
	JSON.stringify(
		{
			benchmark: 'vscode-extension-overlay-registration',
			iterations,
			elapsedMs: Number(elapsed.toFixed(3)),
			meanMicroseconds: Number(((elapsed * 1_000) / iterations).toFixed(3)),
		},
		null,
		2,
	),
);
