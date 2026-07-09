import { useSuspenseQuery } from '@octanejs/tanstack-query';
import { useRouterState, useSearch, Link } from '@octanejs/tanstack-router';
import * as stylex from '@octanejs/stylex';
import { storiesQuery, pageItemsQuery } from '../shared/queries.js';
import { feedForPath, PAGE_SIZE } from '../shared/routes.js';
import { styles } from '../shared/styles.js';
import { StoryRow } from './StoryRow.tsrx';

export function StoriesPage() @{
	// Derive the feed from the active pathname — one StoriesPage serves every
	// feed route ('/', '/newest', '/ask', '/show', '/jobs').
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const feed = feedForPath(pathname);
	// The validated 1-based page from `?page=N` (defaults to 1).
	const page = useSearch({ select: (s) => s.page ?? 1 });

	// The id list, cached per feed (won't re-suspend on a page change).
	const { data: ids } = useSuspenseQuery(storiesQuery(feed));

	const start = (page - 1) * PAGE_SIZE;
	const pageIds = ids.slice(start, start + PAGE_SIZE);

	// Batch-fetch THIS page's items keyed by the id slice. The key changes per
	// page, so this re-suspends on a page change — which lets the router's
	// concurrent navigation transition hold the previous page until it resolves.
	const { data: items } = useSuspenseQuery(pageItemsQuery(pageIds));

	const hasPrev = page > 1;
	const hasMore = start + PAGE_SIZE < ids.length;

	<div data-testid="stories-page" data-feed={feed} data-page={page}>
		@for (const story of items; index i; key story.id) {
			<StoryRow rank={start + i + 1} story={story} />
		}
		<nav data-testid="pager" {...stylex.props(styles.pager)}>
			@if (hasPrev) {
				<Link
					to="."
					search={(prev) => ({ ...prev, page: page - 1 })}
					data-testid="page-prev"
					{...stylex.props(styles.pagerLink)}
				>‹ prev</Link>
			} @else {
				<span data-testid="page-prev-disabled" {...stylex.props(styles.pagerDisabled)}>‹ prev</span>
			}
			<span data-testid="page-indicator" {...stylex.props(styles.pagerPage)}>
				{'page ' + page}
			</span>
			@if (hasMore) {
				<Link
					to="."
					search={(prev) => ({ ...prev, page: page + 1 })}
					data-testid="page-more"
					{...stylex.props(styles.pagerLink)}
				>more ›</Link>
			} @else {
				<span data-testid="page-more-disabled" {...stylex.props(styles.pagerDisabled)}>more ›</span>
			}
		</nav>
	</div>
}
