import { useSuspenseQuery } from '@octanejs/tanstack-query';
import { useRouterState, useSearch, Link } from '@octanejs/tanstack-router';
import * as stylex from '@octanejs/stylex';
import { storiesQuery, pageItemsQuery } from '../shared/queries.js';
import { feedForPath, PAGE_SIZE } from '../shared/routes.js';
import { styles } from '../shared/styles.js';
import { StoryRow } from './StoryRow.js';
import type { Feed } from '../shared/api.js';
import type { Story, Comment } from '../shared/types.js';

function StoriesList({
	ids,
	items,
	feed,
	page,
}: {
	ids: number[];
	items: (Story & Comment)[];
	feed: Feed;
	page: number;
}) {
	const start = (page - 1) * PAGE_SIZE;

	const hasPrev = page > 1;
	const hasMore = start + PAGE_SIZE < ids.length;

	return (
		<div data-testid="stories-page" data-feed={feed} data-page={page}>
			{items.map((story, i) => (
				<StoryRow key={story.id} rank={start + i + 1} story={story} />
			))}
			<nav data-testid="pager" {...stylex.props(styles.pager)}>
				{hasPrev ? (
					<Link
						to="."
						search={(prev: Record<string, unknown>) => ({ ...prev, page: page - 1 })}
						data-testid="page-prev"
						{...stylex.props(styles.pagerLink)}
					>
						‹ prev
					</Link>
				) : (
					<span data-testid="page-prev-disabled" {...stylex.props(styles.pagerDisabled)}>
						‹ prev
					</span>
				)}
				<span data-testid="page-indicator" {...stylex.props(styles.pagerPage)}>
					{'page ' + page}
				</span>
				{hasMore ? (
					<Link
						to="."
						search={(prev: Record<string, unknown>) => ({ ...prev, page: page + 1 })}
						data-testid="page-more"
						{...stylex.props(styles.pagerLink)}
					>
						more ›
					</Link>
				) : (
					<span data-testid="page-more-disabled" {...stylex.props(styles.pagerDisabled)}>
						more ›
					</span>
				)}
			</nav>
		</div>
	);
}

export function StoriesPage() {
	// Derive the feed from the active pathname — one StoriesPage serves every
	// feed route ('/', '/newest', '/ask', '/show', '/jobs').
	const pathname = useRouterState({
		select: (s: { location: { pathname: string } }) => s.location.pathname,
	});
	const feed = feedForPath(pathname);
	// The validated 1-based page from `?page=N` (defaults to 1).
	const page = useSearch({ select: (s: { page?: number }) => s.page ?? 1 });

	// The id list, cached per feed (won't re-suspend on a page change).
	const { data: ids } = useSuspenseQuery(storiesQuery(feed));
	const start = (page - 1) * PAGE_SIZE;
	const pageIds = ids.slice(start, start + PAGE_SIZE);

	// Keep this dependent query sequential in the same component. Besides being
	// the natural data flow, this is the application-level regression for replay
	// preserving each suspense query's retained `use()` position.
	const { data: items } = useSuspenseQuery(pageItemsQuery(pageIds));

	// The typed destructured child intentionally owns the keyed `.map`: it keeps
	// the return-JSX helper-insertion regression covered by a production app.
	return <StoriesList ids={ids} items={items} feed={feed} page={page} />;
}
