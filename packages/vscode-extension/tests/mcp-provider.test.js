import { describe, expect, it, vi } from 'vitest';
import {
	MCP_ENABLED_CONFIGURATION,
	MCP_PROVIDER_ID,
	OCTANE_MCP_ENDPOINT,
	OCTANE_MCP_VERSION,
	registerOctaneMcpProvider,
} from '../src/mcp-provider.cjs';

function createVscode(enabled = true) {
	let configurationListener;
	let registeredProvider;
	const disposed = [];
	const fired = vi.fn();
	const definitionConstructor = vi.fn(
		function McpHttpServerDefinition(label, uri, headers, version) {
			Object.assign(this, { label, uri, headers, version });
		},
	);
	const vscode = {
		EventEmitter: class EventEmitter {
			event = Symbol('event');
			fire = fired;
			dispose = vi.fn(() => disposed.push('event'));
		},
		McpHttpServerDefinition: definitionConstructor,
		Uri: {
			parse: vi.fn((value) => ({ value })),
		},
		lm: {
			registerMcpServerDefinitionProvider: vi.fn((id, provider) => {
				registeredProvider = provider;
				return { dispose: vi.fn(() => disposed.push('provider')) };
			}),
		},
		workspace: {
			getConfiguration: vi.fn(() => ({ get: vi.fn(() => enabled) })),
			onDidChangeConfiguration: vi.fn((listener) => {
				configurationListener = listener;
				return { dispose: vi.fn(() => disposed.push('configuration')) };
			}),
		},
	};
	return {
		configurationListener: () => configurationListener,
		definitionConstructor,
		disposed,
		fired,
		registeredProvider: () => registeredProvider,
		vscode,
	};
}

describe('Octane MCP provider', () => {
	it('publishes the official remote server without starting a connection', () => {
		const mock = createVscode();
		const context = { subscriptions: [] };
		const provider = registerOctaneMcpProvider(mock.vscode, context);

		expect(mock.vscode.lm.registerMcpServerDefinitionProvider).toHaveBeenCalledWith(
			MCP_PROVIDER_ID,
			provider,
		);
		expect(mock.vscode.Uri.parse).toHaveBeenCalledOnce();
		expect(mock.vscode.Uri.parse).toHaveBeenCalledWith(OCTANE_MCP_ENDPOINT);
		expect(provider.provideMcpServerDefinitions()).toEqual([
			{
				headers: {},
				label: 'Octane',
				uri: { value: OCTANE_MCP_ENDPOINT },
				version: OCTANE_MCP_VERSION,
			},
		]);
		expect(context.subscriptions).toHaveLength(3);
	});

	it('hides the server when the user disables Octane MCP', () => {
		const mock = createVscode(false);
		const provider = registerOctaneMcpProvider(mock.vscode, { subscriptions: [] });

		expect(provider.provideMcpServerDefinitions()).toEqual([]);
	});

	it('notifies VS Code only when the MCP setting changes', () => {
		const mock = createVscode();
		registerOctaneMcpProvider(mock.vscode, { subscriptions: [] });
		const affectsConfiguration = vi.fn((setting) => setting === MCP_ENABLED_CONFIGURATION);

		mock.configurationListener()({ affectsConfiguration });

		expect(affectsConfiguration).toHaveBeenCalledWith(MCP_ENABLED_CONFIGURATION);
		expect(mock.fired).toHaveBeenCalledOnce();

		mock.fired.mockClear();
		mock.configurationListener()({ affectsConfiguration: () => false });
		expect(mock.fired).not.toHaveBeenCalled();
	});

	it('passes the definition through resolution without side effects', () => {
		const mock = createVscode();
		const provider = registerOctaneMcpProvider(mock.vscode, { subscriptions: [] });
		const definition = provider.provideMcpServerDefinitions()[0];

		expect(provider.resolveMcpServerDefinition(definition)).toBe(definition);
	});

	it('fails clearly when the stable MCP API is unavailable', () => {
		const mock = createVscode();
		mock.vscode.lm = {};

		expect(() => registerOctaneMcpProvider(mock.vscode, { subscriptions: [] })).toThrow(
			/stable MCP extension API/,
		);
	});
});
