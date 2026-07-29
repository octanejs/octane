// @vitest-environment node
//
// Production smoke test — runs the REAL `vite build` (client + server bundles
// via @octanejs/vite-plugin) and drives the built dist/server handler: the
// same export the Vercel adapter's function wraps and `octane-preview` boots.
// This proves the DEPLOYED artifact speaks MCP and serves the REST surface —
// including that the build-time content snapshot survived bundling. The build
// runs from an OS-temporary mirror so Vite's output/cache churn never touches
// the checkout; source and dependency directories remain the real ones.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';

const sourceRoot = fileURLToPath(new URL('..', import.meta.url));
const projectFiles = ['index.html', 'package.json', 'vite.config.ts', 'octane.config.ts'];

let mcpRoot = '';
let serverEntry = '';

let handler: (request: Request) => Promise<Response>;

const MCP_URL = 'http://localhost/v1/mcp';
const MCP_HEADERS = {
	'content-type': 'application/json',
	accept: 'application/json, text/event-stream',
};

async function rpc(method: string, params: unknown, id: number) {
	const response = await handler(
		new Request(MCP_URL, {
			method: 'POST',
			headers: MCP_HEADERS,
			body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
		}),
	);
	expect(response.status).toBe(200);
	return response.json();
}

function stageProject(): string {
	// realpath avoids macOS's /var → /private/var alias: Rolldown requires HTML
	// inputs to be inside the exact normalized root when choosing output names.
	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'octane-website-mcp-')));
	const linkType = process.platform === 'win32' ? 'junction' : 'dir';

	for (const directory of ['src', 'public']) {
		fs.symlinkSync(path.join(sourceRoot, directory), path.join(root, directory), linkType);
	}

	// Keep node_modules itself real so Vite's .vite/.vite-temp directories stay
	// in the temporary root. Its package entries can point at the installed
	// dependency graph without copying it.
	const sourceModules = path.join(sourceRoot, 'node_modules');
	const stagedModules = path.join(root, 'node_modules');
	fs.mkdirSync(stagedModules);
	for (const entry of fs.readdirSync(sourceModules, { withFileTypes: true })) {
		if (entry.name.startsWith('.')) continue;
		const source = path.join(sourceModules, entry.name);
		const target = path.join(stagedModules, entry.name);
		if (fs.statSync(source).isDirectory()) {
			fs.symlinkSync(source, target, linkType);
		} else {
			fs.copyFileSync(source, target);
		}
	}

	for (const file of projectFiles) {
		fs.copyFileSync(path.join(sourceRoot, file), path.join(root, file));
	}
	return root;
}

beforeAll(async () => {
	mcpRoot = stageProject();
	serverEntry = path.join(mcpRoot, 'dist/server/entry.js');
	await build({ root: mcpRoot, logLevel: 'silent' });
	({ handler } = await import(pathToFileURL(serverEntry).href));
}, 240_000);

afterAll(() => {
	if (mcpRoot) fs.rmSync(mcpRoot, { recursive: true, force: true });
});

describe('built MCP handler', () => {
	it('produced the deployable layout and ran the Vercel adapter', () => {
		expect(fs.existsSync(serverEntry)).toBe(true);
		const outputDir = path.join(mcpRoot, '.vercel/output');
		expect(fs.existsSync(path.join(outputDir, 'functions/index.func/entry.js'))).toBe(true);
		const config = JSON.parse(fs.readFileSync(path.join(outputDir, 'config.json'), 'utf-8'));
		expect(config.routes).toContainEqual({ handle: 'filesystem' });
	});

	it('completes an MCP initialize → tools/list round-trip', async () => {
		const initialize = await rpc(
			'initialize',
			{
				protocolVersion: '2025-06-18',
				capabilities: {},
				clientInfo: { name: 'e2e', version: '0.0.0' },
			},
			1,
		);
		expect(initialize.result.serverInfo.name).toBe('octane');

		const list = await rpc('tools/list', {}, 2);
		const names = list.result.tools.map((tool: { name: string }) => tool.name).sort();
		expect(names).toEqual([
			'octane_bindings',
			'octane_bindings_status',
			'octane_bridge_scan',
			'octane_compile',
			'octane_docs_read',
			'octane_docs_search',
			'octane_skill',
		]);
	});

	it('serves a real tool call from the bundled snapshot (no filesystem)', async () => {
		const call = await rpc(
			'tools/call',
			{ name: 'octane_docs_read', arguments: { slug: 'quick-start' } },
			3,
		);
		const text = call.result.content[0].text as string;
		expect(text).toContain('# Quick start');
		expect(text.length).toBeGreaterThan(1000);
	});

	it('compiles .tsrx through the bundled compiler', async () => {
		const call = await rpc(
			'tools/call',
			{
				name: 'octane_compile',
				arguments: { source: `export function X() @{ <div>{'hi'}</div> }` },
			},
			4,
		);
		const payload = JSON.parse(call.result.content[0].text);
		expect(payload.ok).toBe(true);
		expect(payload.code).toContain('X');
	});

	it('serves the REST surface', async () => {
		const index = await handler(new Request('http://localhost/v1/docs'));
		expect(index.status).toBe(200);
		expect((await index.json()).docs.length).toBeGreaterThanOrEqual(9);

		const llms = await handler(new Request('http://localhost/llms-full.txt'));
		expect(llms.status).toBe(200);
		expect((await llms.text()).length).toBeGreaterThan(50_000);
	});

	it('server-renders the landing page with the hydration payload', async () => {
		const response = await handler(new Request('http://localhost/'));
		expect(response.status).toBe(200);
		const html = await response.text();
		expect(html).toContain('Octane MCP');
		expect(html).toContain('octane_docs_search');
		expect(html).toContain('"entry":"/src/app/Landing.tsrx"');
	});

	it('404s unmatched paths', async () => {
		const response = await handler(new Request('http://localhost/definitely/not/a/path'));
		expect(response.status).toBe(404);
	});
});
