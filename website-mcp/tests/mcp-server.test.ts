// End-to-end over the MCP protocol: a real SDK Client connected to
// createMcpServer() through a linked in-memory transport pair. This asserts
// what a remote agent actually observes — the tool list, tool results, and
// resource reads — independent of the HTTP layer.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp/create-server.ts';
import { BINDING_CATEGORIES, BINDING_STATUSES } from '../src/content/bindings.ts';
import { COMMUNITY_BINDING_GROUPS } from '../../website/src/content/community-bindings.ts';

let client: Client;
let cleanup: () => Promise<void>;
const communitySearchNames = new Set(
	COMMUNITY_BINDING_GROUPS.flatMap((group) => group.entries.flatMap((entry) => entry.searchNames)),
);

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
		expect(hit.kind).toBe('doc');
		expect(hit.url).toMatch(/^https:\/\//);
		expect(hit.lines.length).toBeGreaterThan(0);
	});

	it('octane_docs_search returns packages as exact outbound destinations', async () => {
		const result = await client.callTool({
			name: 'octane_docs_search',
			arguments: { query: '@distilled.cloud/octane' },
		});
		const payload = JSON.parse(firstText(result));
		expect(payload.results).toHaveLength(1);
		expect(payload.results[0]).toEqual({
			kind: 'package',
			title: 'Alchemy',
			matchedName: '@distilled.cloud/octane',
			purpose: 'Build and deployment integration for Octane on Cloudflare, AWS, and Node.',
			owner: 'Alchemy',
			url: 'https://github.com/alchemy-run/alchemy/tree/main/packages/frontend-frameworks/src/octane',
			score: expect.any(Number),
		});
	});

	it('octane_docs_search explains document follow-up and package destinations', async () => {
		const { tools } = await client.listTools();
		const description = tools.find((tool) => tool.name === 'octane_docs_search')?.description;
		expect(description).toContain('octane_docs_read');
		expect(description).toMatch(/package hits?.*outbound/i);

		const result = await client.callTool({
			name: 'octane_docs_search',
			arguments: { query: 'zz-no-octane-result-9f4c' },
		});
		expect(JSON.parse(firstText(result))).toEqual({
			query: 'zz-no-octane-result-9f4c',
			results: [],
		});
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

	it('octane_bridge_scan classifies portable rewrites with a migration plan', async () => {
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
		expect(report.verdict).toBe('bridgeable-with-rewrites');
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

	it('keeps community projects out of official binding tools and resources', async () => {
		const [bindingsResult, statusesResult, resourceResult] = await Promise.all([
			client.callTool({ name: 'octane_bindings', arguments: {} }),
			client.callTool({ name: 'octane_bindings_status', arguments: {} }),
			client.readResource({ uri: 'octane://bindings' }),
		]);
		const bindings = JSON.parse(firstText(bindingsResult));
		const statuses = JSON.parse(firstText(statusesResult));
		const resource = JSON.parse((resourceResult.contents[0] as { text?: string }).text ?? '{}');
		const expectedPackages = BINDING_CATEGORIES.flatMap((category) => category.packages);
		const expectedStatuses = BINDING_STATUSES.map((status) => status.package);

		expect(bindings.count).toBe(BINDING_STATUSES.length);
		expect(bindings.categories).toEqual(BINDING_CATEGORIES);
		expect(statuses.statuses.map((status: { package: string }) => status.package)).toEqual(
			expectedStatuses,
		);
		expect(resource.categories).toEqual(BINDING_CATEGORIES);
		expect(resource.statuses.map((status: { package: string }) => status.package)).toEqual(
			expectedStatuses,
		);
		for (const packageName of [...expectedPackages, ...expectedStatuses]) {
			expect(communitySearchNames.has(packageName)).toBe(false);
		}
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
