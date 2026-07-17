// MCP resources over the same snapshot the tools serve: docs and skills as
// listable/completable markdown resources, plus the bindings catalog as one
// JSON resource. Clients that prefer resource reads over tool calls (or that
// attach resources to context) get identical content either way.
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOCS, DOC_SLUGS, docBySlug } from '../content/docs.ts';
import { BINDING_CATEGORIES, BINDING_STATUSES, KNOWN_BINDINGS } from '../content/bindings.ts';
import { SKILLS, SKILL_NAMES } from '../content/skills.ts';

export function registerResources(server: McpServer): void {
	server.registerResource(
		'octane-docs',
		new ResourceTemplate('octane://docs/{slug}', {
			list: async () => ({
				resources: DOCS.map((doc) => ({
					uri: `octane://docs/${doc.slug}`,
					name: doc.title,
					description: doc.description,
					mimeType: 'text/markdown',
				})),
			}),
			complete: {
				slug: (value) => DOC_SLUGS.filter((slug) => slug.startsWith(value)),
			},
		}),
		{
			title: 'Octane documentation',
			description: 'The official Octane docs as markdown, one resource per document.',
			mimeType: 'text/markdown',
		},
		async (uri, variables) => {
			const slug = String(variables.slug);
			const doc = docBySlug(slug);
			if (!doc) throw new Error(`Unknown doc slug '${slug}'. Known: ${DOC_SLUGS.join(', ')}`);
			return {
				contents: [{ uri: uri.href, mimeType: 'text/markdown', text: doc.markdown }],
			};
		},
	);

	server.registerResource(
		'octane-skills',
		new ResourceTemplate('octane://skills/{name}', {
			list: async () => ({
				resources: SKILL_NAMES.map((name) => ({
					uri: `octane://skills/${name}`,
					name,
					mimeType: 'text/markdown',
				})),
			}),
			complete: {
				name: (value) => SKILL_NAMES.filter((name) => name.startsWith(value)),
			},
		}),
		{
			title: 'Octane agent skills',
			description: 'Task guides: bridging React packages, migrating components, SSR setup.',
			mimeType: 'text/markdown',
		},
		async (uri, variables) => {
			const name = String(variables.name);
			const skill = SKILLS[name];
			if (!skill) throw new Error(`Unknown skill '${name}'. Known: ${SKILL_NAMES.join(', ')}`);
			return {
				contents: [{ uri: uri.href, mimeType: 'text/markdown', text: skill }],
			};
		},
	);

	server.registerResource(
		'octane-bindings',
		'octane://bindings',
		{
			title: 'Octane bindings catalog',
			description:
				'The React-package → @octanejs/* binding map, the categorized catalog, and per-package parity status.',
			mimeType: 'application/json',
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(
						{
							reactToOctane: KNOWN_BINDINGS,
							categories: BINDING_CATEGORIES,
							statuses: BINDING_STATUSES,
						},
						null,
						2,
					),
				},
			],
		}),
	);
}
