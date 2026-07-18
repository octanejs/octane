// End-to-end over the MCP protocol: a real SDK Client connected to
// createMcpServer() through a linked in-memory transport pair. This asserts
// what a remote agent actually observes — the tool list, tool results, and
// resource reads — independent of the HTTP layer.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp/create-server.ts';

let client: Client;
let cleanup: () => Promise<void>;

beforeEach(async () => {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createMcpServer();
	client = new Client({ name: 'mcp-tests', version: '0.0.0' });
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	cleanup = async () => {
		await client.close();
		await server.close();
	};
});

afterEach(async () => {
	await cleanup();
});

function firstText(result: unknown): string {
	const content = (result as { content: Array<{ type: string; text: string }> }).content;
	expect(content[0]?.type).toBe('text');
	return content[0].text;
}

describe('remote MCP server', () => {
	it('exposes exactly the v1 remote tools — no repo-mode tools leak', async () => {
		const { tools } = await client.listTools();
		expect(tools.map((tool) => tool.name).sort()).toEqual([
			'octane_bindings',
			'octane_bindings_status',
			'octane_bridge_scan',
			'octane_compile',
			'octane_docs_read',
			'octane_docs_search',
			'octane_skill',
		]);
	});

	it('octane_docs_search returns deep links with matching lines', async () => {
		const result = await client.callTool({
			name: 'octane_docs_search',
			arguments: { query: 'hydrateRoot' },
		});
		const payload = JSON.parse(firstText(result));
		expect(payload.results.length).toBeGreaterThan(0);
		const hit = payload.results[0];
		expect(hit.url).toMatch(/^https:\/\//);
		expect(hit.lines.length).toBeGreaterThan(0);
	});

	it('octane_docs_read returns the document with provenance', async () => {
		const result = await client.callTool({
			name: 'octane_docs_read',
			arguments: { slug: 'quick-start' },
		});
		const body = firstText(result);
		expect(body).toContain('# Quick start');
		expect(body).toContain('https://octanejs.dev/docs/quick-start');
		expect(body.length).toBeGreaterThan(1000);
	});

	it('octane_compile round-trips a valid component and a diagnostic', async () => {
		const ok = await client.callTool({
			name: 'octane_compile',
			arguments: { source: `export function X() @{ <div>{'hi'}</div> }` },
		});
		const compiled = JSON.parse(firstText(ok));
		expect(compiled.ok).toBe(true);
		expect(compiled.warnings).toEqual([]);

		const warned = await client.callTool({
			name: 'octane_compile',
			arguments: { source: `export function X() @{ <input onChange={() => {}} /> }` },
		});
		const warningResult = JSON.parse(firstText(warned));
		expect(warningResult.ok).toBe(true);
		expect(warningResult.code.length).toBeGreaterThan(0);
		expect(warningResult.warnings).toHaveLength(1);
		expect(warningResult.warnings[0].code).toBe('OCTANE_NATIVE_TEXT_ONCHANGE');

		const bad = await client.callTool({
			name: 'octane_compile',
			arguments: { source: `export async function X() @{ <div>{'hi'}</div> }` },
		});
		const diagnostic = JSON.parse(firstText(bad));
		expect(diagnostic.ok).toBe(false);
		expect(diagnostic.error.message).toMatch(/async/);
	});

	it('octane_bridge_scan flags unsupported APIs with a migration plan', async () => {
		const result = await client.callTool({
			name: 'octane_bridge_scan',
			arguments: {
				source: `
					import React from 'react';
					export class Legacy extends React.Component {
						componentWillMount() {}
						render() { return null; }
					}
				`,
			},
		});
		const report = JSON.parse(firstText(result));
		expect(report.classComponents).toBe(true);
		expect(report.verdict).toBe('needs-rework');
		expect(report.plan.length).toBeGreaterThan(0);
	});

	it('octane_bindings_status resolves a React upstream name', async () => {
		const result = await client.callTool({
			name: 'octane_bindings_status',
			arguments: { package: '@tanstack/react-query' },
		});
		const payload = JSON.parse(firstText(result));
		expect(payload.statuses).toHaveLength(1);
		expect(payload.statuses[0].package).toBe('@octanejs/tanstack-query');
		expect(payload.statuses[0].upstream.package).toBe('@tanstack/react-query');
	});

	it('lists and reads docs resources', async () => {
		const { resources } = await client.listResources();
		const uris = resources.map((resource) => resource.uri);
		expect(uris).toContain('octane://bindings');

		const doc = await client.readResource({ uri: 'octane://docs/core-apis' });
		const docContent = doc.contents[0] as { mimeType?: string; text?: string };
		expect(docContent.mimeType).toBe('text/markdown');
		expect(docContent.text?.length).toBeGreaterThan(5000);

		const skill = await client.readResource({ uri: 'octane://skills/setup-ssr' });
		expect((skill.contents[0] as { text?: string }).text).toContain('Skill');
	});
});
