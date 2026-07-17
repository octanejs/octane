// The plain-HTTP surface for agents without an MCP client (curl, WebFetch):
// the same snapshot the MCP tools serve, as versioned JSON and text. Loaded
// via dynamic import from routes.ts so the content snapshot stays out of the
// config graph.
import type { Context } from '@octanejs/vite-plugin';
import octanePkg from '../../../packages/octane/package.json';
import { DOCS, docBySlug } from '../content/docs.ts';
import { BINDING_CATEGORIES, BINDING_STATUSES, KNOWN_BINDINGS } from '../content/bindings.ts';
import { LLMS_TXT, LLMS_FULL_TXT } from '../content/llms.ts';
import { json, plainText } from './http.ts';

const octaneVersion = octanePkg.version;

export function getDocsIndex(): Response {
	return json({
		octaneVersion,
		docs: DOCS.map(({ markdown, ...doc }) => ({ ...doc, characters: markdown.length })),
	});
}

export function getDoc(context: Context): Response {
	const doc = docBySlug(context.params.slug);
	if (!doc) {
		return json(
			{
				error: `Unknown doc slug '${context.params.slug}'.`,
				slugs: DOCS.map((entry) => entry.slug),
			},
			{ status: 404, cache: false },
		);
	}
	return json(doc);
}

export function getBindings(): Response {
	return json({
		octaneVersion,
		count: BINDING_STATUSES.length,
		reactToOctane: KNOWN_BINDINGS,
		categories: BINDING_CATEGORIES,
		statuses: BINDING_STATUSES,
	});
}

export function getLlmsTxt(): Response {
	return plainText(LLMS_TXT);
}

export function getLlmsFullTxt(): Response {
	return plainText(LLMS_FULL_TXT);
}
