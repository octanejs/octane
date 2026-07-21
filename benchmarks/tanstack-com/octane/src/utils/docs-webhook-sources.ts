import { libraries } from '~/libraries';

export type DocsWebhookSource = {
	refs: Array<string>;
	repo: string;
};

const docsWebhookSourceMap = libraries.reduce((map, library) => {
	if (!library.latestBranch) {
		return map;
	}

	const refs = map.get(library.repo) ?? new Set<string>();
	refs.add(library.latestBranch);
	map.set(library.repo, refs);

	return map;
}, new Map<string, Set<string>>());

export const docsWebhookSources = Array.from(docsWebhookSourceMap.entries())
	.map(([repo, refs]) => ({
		repo,
		refs: Array.from(refs).sort(),
	}))
	.sort((a, b) => a.repo.localeCompare(b.repo));

export function isWatchedDocsWebhookSource(repo: string, gitRef: string) {
	return docsWebhookSources.some((source) => source.repo === repo && source.refs.includes(gitRef));
}
