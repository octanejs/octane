// The v1 remote tool surface. Registration style mirrors the stdio server
// (packages/octane-mcp-server/src/index.js): zod raw shapes for inputs, JSON
// payloads stringified into a single text block. Everything here is read-only
// over the build-time snapshot — the repo-mode tools that spawn processes or
// read a checkout are deliberately NOT part of the remote surface.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { bridgeReportFromSource } from '@octanejs/mcp-server/bridge';
import { DOC_SLUGS, docBySlug } from '../content/docs.ts';
import { search } from '../content/search.ts';
import {
	BINDING_CATEGORIES,
	BINDING_STATUSES,
	KNOWN_BINDINGS,
	resolveBinding,
} from '../content/bindings.ts';
import { SKILLS, SKILL_NAMES } from '../content/skills.ts';
import { runCompile } from './compile-tool.ts';

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

function text(value: string) {
	return { content: [{ type: 'text' as const, text: value }] };
}

function json(value: unknown) {
	return text(JSON.stringify(value, null, 2));
}

/** Deep link for a search hit: website docs anchor on-site, repo docs on GitHub. */
function sectionUrl(slug: string, id: string): string {
	const doc = docBySlug(slug);
	const base = doc?.url ?? `https://octanejs.dev/docs/${slug}`;
	return id ? `${base}#${id}` : base;
}

export function registerRemoteTools(server: McpServer): void {
	server.registerTool(
		'octane_docs_search',
		{
			title: 'Search the Octane docs',
			description:
				'Section-level full-text search over the official Octane documentation (the same index behind octanejs.dev search), including the SSR deep dive and the full React-divergence reference. Returns deep links with the matching lines; follow up with octane_docs_read for a full document.',
			inputSchema: {
				query: z.string().min(2).max(200),
				limit: z.number().int().min(1).max(20).default(6),
			},
			annotations: READ_ONLY,
		},
		async ({ query, limit }) => {
			const results = search(query, limit).map((group) => ({
				slug: group.slug,
				id: group.id,
				title: group.title,
				docTitle: group.docTitle,
				url: sectionUrl(group.slug, group.id),
				score: group.score,
				lines: group.lines.map((line) => ({
					code: line.code,
					text: line.parts.map((part) => part.text).join(''),
				})),
			}));
			return json({ query, results });
		},
	);

	server.registerTool(
		'octane_docs_read',
		{
			title: 'Read an Octane doc',
			description: `Return one Octane document as markdown by slug. Slugs: ${DOC_SLUGS.join(', ')}. 'ssr' is the SSR deep dive; 'differences-from-react-reference' is the exhaustive divergence reference.`,
			inputSchema: {
				slug: z.enum(DOC_SLUGS),
			},
			annotations: READ_ONLY,
		},
		async ({ slug }) => {
			const doc = docBySlug(slug)!;
			return text(`# ${doc.title}\n\n> ${doc.description}\n> ${doc.url}\n\n${doc.markdown}`);
		},
	);

	server.registerTool(
		'octane_compile',
		{
			title: 'Compile Octane source',
			description:
				"Compile/validate source with the real Octane compiler. Paste .tsrx (directive blocks, @{ } bodies) or standard .tsx/.jsx; a successful result includes runnable compiled JS plus nonfatal warnings with codes and authored ranges. Fatal parse/compile failures return an error with line/column and a code frame. Use mode 'server' for SSR output.",
			inputSchema: {
				source: z.string().min(1).max(200_000),
				filename: z
					.string()
					.regex(/\.(tsrx|tsx|jsx)$/, 'must end in .tsrx, .tsx, or .jsx')
					.default('input.tsrx')
					.describe('The extension selects the dialect: .tsrx enables directive blocks/@{ }.'),
				mode: z.enum(['client', 'server']).default('client'),
				dev: z.boolean().default(false),
				autoMemo: z.boolean().optional(),
				parallelUse: z.boolean().optional(),
			},
			annotations: READ_ONLY,
		},
		async (input) => json(runCompile(input)),
	);

	server.registerTool(
		'octane_bindings',
		{
			title: 'List official Octane bindings',
			description:
				'Return the official @octanejs/* bindings: the React-package → binding map and the categorized catalog. These are native Octane ports — the performance option next to running the React original via @octanejs/react-compat. Check here before porting by hand; use octane_bindings_status for per-package parity detail.',
			inputSchema: {},
			annotations: READ_ONLY,
		},
		async () =>
			json({
				count: BINDING_STATUSES.length,
				reactToOctane: KNOWN_BINDINGS,
				categories: BINDING_CATEGORIES,
			}),
	);

	server.registerTool(
		'octane_bindings_status',
		{
			title: 'Octane binding parity status',
			description:
				"Per-binding parity status from each package's status.json: upstream package/version, ported surface, intentional divergences, SSR support, and last-verified date. Accepts the binding name ('@octanejs/zustand'), its directory ('zustand'), or the React package it ports ('@tanstack/react-query'); omit for all bindings.",
			inputSchema: {
				package: z.string().optional(),
			},
			annotations: READ_ONLY,
		},
		async ({ package: name }) => {
			if (!name) return json({ statuses: BINDING_STATUSES });
			const status = resolveBinding(name);
			if (!status) {
				return json({
					error: `Unknown binding '${name}'.`,
					known: BINDING_STATUSES.map((entry) => entry.package),
				});
			}
			return json({ statuses: [status] });
		},
	);

	server.registerTool(
		'octane_bridge_scan',
		{
			title: 'Scan React source for Octane compatibility',
			description:
				'Scan pasted React source for React API usage and return an Octane compatibility report: which APIs map 1:1, which need rewrites (forwardRef, class components, React-style text-host onChange, react-dom/server imports), whether an official @octanejs binding already exists, and a step-by-step migration plan. Text-host event scanning preserves component callbacks, selects/checkables, and deliberate native commit behavior. Paste library source or your own component code.',
			inputSchema: {
				source: z.string().min(1).max(500_000),
				packageName: z
					.string()
					.optional()
					.describe(
						'npm name of the package the source came from — enables the existing-binding and vanilla-core lookups.',
					),
			},
			annotations: READ_ONLY,
		},
		async ({ source, packageName }) => json(bridgeReportFromSource(source, { packageName })),
	);

	server.registerTool(
		'octane_skill',
		{
			title: 'Octane skill',
			description:
				'Return an Octane agent skill by name: bridging React packages, migrating React components to .tsrx, intentional React divergences, and SSR setup.',
			inputSchema: {
				name: z.enum(SKILL_NAMES),
			},
			annotations: READ_ONLY,
		},
		async ({ name }) => text(SKILLS[name]),
	);
}
