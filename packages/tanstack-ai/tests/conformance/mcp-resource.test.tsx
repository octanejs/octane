/** @jsxImportSource octane */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@octanejs/testing-library';
import { render as renderReact, cleanup as cleanupReact } from '@testing-library/react';
import { createElement as reactElement } from 'react';
import { MCPAppResource as ReactResource } from '@tanstack/ai-react/mcp-apps';
import { MCPAppResource } from '../../src/mcp-app-resource.tsrx';
import type { UIResourcePart } from '@tanstack/ai';
import type { McpAppBridge } from '@tanstack/ai-client';

afterEach(() => {
	cleanupReact();
	vi.unstubAllGlobals();
});

const part: UIResourcePart = {
	type: 'ui-resource',
	serverId: 'catalog',
	toolCallId: 'call-1',
	toolName: 'product',
	resource: { uri: 'ui://catalog/product', mimeType: 'text/html', text: '<h1>Product</h1>' },
};
const sandbox = { url: new URL('https://sandbox.example.test/proxy.html') };

async function verifyProtocol(framework: 'Octane' | 'React') {
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	const bridge: McpAppBridge = {
		callTool: vi.fn().mockResolvedValue({ price: 12 }),
		sendPrompt: vi.fn().mockResolvedValue(undefined),
		openLink: vi.fn().mockReturnValue({ isError: false }),
	};
	const props = { part, sandbox, bridge, toolInput: { sku: 'one' } };
	const mounted =
		framework === 'Octane'
			? render(<MCPAppResource {...props} />)
			: renderReact(reactElement(ReactResource, props));
	const iframe = await waitFor(() => {
		const value = mounted.container.querySelector('iframe');
		expect(value).not.toBeNull();
		return value!;
	});
	const guest = iframe.contentWindow!;
	const post = vi.spyOn(guest, 'postMessage');
	const send = (method: string, params: unknown, id?: number, source: Window = guest) => {
		window.dispatchEvent(
			new MessageEvent('message', {
				source,
				origin: sandbox.url.origin,
				data: { jsonrpc: '2.0', method, params, ...(id === undefined ? {} : { id }) },
			}),
		);
	};
	const outbound = () => post.mock.calls.map(([message]) => message);
	send('ui/notifications/sandbox-proxy-ready', {});
	await waitFor(() =>
		expect(outbound()).toContainEqual(
			expect.objectContaining({
				method: 'ui/notifications/sandbox-resource-ready',
				params: expect.objectContaining({ html: part.resource.text }),
			}),
		),
	);
	send(
		'ui/initialize',
		{ protocolVersion: '2026-01-26', appInfo: { name: 'test', version: '1' }, appCapabilities: {} },
		1,
	);
	await waitFor(() =>
		expect(outbound()).toContainEqual(
			expect.objectContaining({
				id: 1,
				result: expect.objectContaining({ protocolVersion: '2026-01-26' }),
			}),
		),
	);
	send('ui/notifications/initialized', {});
	await waitFor(() =>
		expect(outbound()).toContainEqual(
			expect.objectContaining({
				method: 'ui/notifications/tool-input',
				params: { arguments: { sku: 'one' } },
			}),
		),
	);

	send('tools/call', { name: 'price', arguments: { sku: 'one' } }, 2, window);
	await Promise.resolve();
	expect(bridge.callTool).not.toHaveBeenCalled();
	send('tools/call', { name: 'price', arguments: { sku: 'one' } }, 3);
	await waitFor(() =>
		expect(outbound()).toContainEqual(
			expect.objectContaining({
				id: 3,
				result: {
					content: [{ type: 'text', text: '{"price":12}' }],
					structuredContent: { price: 12 },
				},
			}),
		),
	);
	expect(bridge.callTool).toHaveBeenCalledWith({
		serverId: 'catalog',
		toolName: 'price',
		args: { sku: 'one' },
	});
	send('ui/message', { role: 'user', content: [{ type: 'text', text: 'Buy it' }] }, 4);
	send('ui/open-link', { url: 'https://shop.example.test/product' }, 5);
	await waitFor(() => {
		expect(bridge.sendPrompt).toHaveBeenCalledWith('Buy it');
		expect(bridge.openLink).toHaveBeenCalledWith('https://shop.example.test/product');
	});
	mounted.unmount();
	send('tools/call', { name: 'price', arguments: {} }, 6);
	await Promise.resolve();
	expect(bridge.callTool).toHaveBeenCalledTimes(1);
	expect(iframe.isConnected).toBe(false);
}

describe('MCP resource public protocol', () => {
	// @parity-case differential:mcp-resource-protocol-octane
	it('Octane initializes the sandbox, routes requests, and rejects messages after teardown', () =>
		verifyProtocol('Octane'));
	// @parity-case differential:mcp-resource-protocol-react
	it('React initializes the sandbox, routes requests, and rejects messages after teardown', () =>
		verifyProtocol('React'));
});
