import * as v from 'valibot';
import { fetchRepoFile, isRecoverableGitHubContentError } from './documents.server';
import { docsNavTabIds, type DocsNavTabId } from './docsNavTabs';
import { createServerFn } from '@tanstack/react-start';
import { setResponseHeaders } from '@tanstack/react-start/server';

export type MenuItem = {
	label: string | React.ReactNode;
	tab?: DocsNavTabId;
	children: {
		label: string | React.ReactNode;
		to: string;
		badge?: string;
		/** ISO date string marking when the page was added. Drives the "New" sidebar pill. */
		addedAt?: string;
		/** ISO date string marking when the page was last meaningfully updated. Drives the "Updated" sidebar pill. */
		updatedAt?: string;
		tab?: DocsNavTabId;
	}[];
	collapsible?: boolean;
	defaultCollapsed?: boolean;
};

const tabSchema = v.optional(v.picklist(docsNavTabIds));

const configSchema = v.object({
	sections: v.array(
		v.object({
			label: v.string(),
			tab: tabSchema,
			children: v.array(
				v.object({
					label: v.string(),
					to: v.string(),
					badge: v.optional(v.string()),
					addedAt: v.optional(v.string()),
					updatedAt: v.optional(v.string()),
					tab: tabSchema,
				}),
			),
			frameworks: v.optional(
				v.array(
					v.object({
						label: v.string(),
						children: v.array(
							v.object({
								label: v.string(),
								to: v.string(),
								badge: v.optional(v.string()),
								addedAt: v.optional(v.string()),
								updatedAt: v.optional(v.string()),
								tab: tabSchema,
							}),
						),
					}),
				),
			),
			collapsible: v.optional(v.boolean()),
			defaultCollapsed: v.optional(v.boolean()),
		}),
	),
	users: v.optional(v.array(v.string())),
});

export type ConfigSchema = v.InferOutput<typeof configSchema>;

function getEmptyConfig(): ConfigSchema {
	return { sections: [] };
}

function parseDocsConfig(config: string) {
	const tanstackDocsConfigFromJson = JSON.parse(config);
	const validationResult = v.safeParse(configSchema, tanstackDocsConfigFromJson);

	if (!validationResult.success) {
		console.error(JSON.stringify(validationResult.issues, null, 2));
		throw new Error('Valibot validation failed');
	}

	return validationResult.output;
}

/**
  Fetch the config file for the project and validate it.
  */
export const getTanstackDocsConfig = createServerFn({ method: 'GET' })
	.validator(v.object({ repo: v.string(), branch: v.string(), docsRoot: v.string() }))
	.handler(async ({ data }: { data: { repo: string; branch: string; docsRoot: string } }) => {
		const { repo, branch, docsRoot } = data;

		let config: string | null;

		try {
			config = await fetchRepoFile(repo, branch, `${docsRoot}/config.json`);
		} catch (error) {
			if (!isRecoverableGitHubContentError(error)) {
				throw error;
			}

			return getEmptyConfig();
		}

		if (!config) {
			return getEmptyConfig();
		}

		try {
			const parsedConfig = parseDocsConfig(config);

			setResponseHeaders(
				new Headers({
					'Cache-Control': 'public, max-age=0, must-revalidate',
					'Cloudflare-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
					'Cache-Tag': [
						'docs-config:all',
						`docs-config:${repo}`,
						`docs-config:${repo}:${branch}`,
					].join(','),
				}),
			);

			return parsedConfig;
		} catch (e) {
			console.error(e);
			throw new Error('Invalid docs/config.json file', { cause: e });
		}
	});
