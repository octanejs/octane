import { useSuspenseQuery } from '@octane-ts/query';
import { topStoriesQuery } from '../shared/queries.js';
import { Suspense } from 'octane';
import { StoryItem } from './StoryItem.tsrx';
import { RowSkeleton } from './Pending.tsrx';

const PAGE_SIZE = 25;

export function StoriesPage() @{
	// Suspends to the route's pendingComponent while the id list loads, then
	// returns `{ data }` (no loading/error branches — Suspense + an error
	// boundary handle those).
	const { data } = useSuspenseQuery(topStoriesQuery());

	const ids = data.slice(0, PAGE_SIZE);

	<div data-testid="stories-page">
		@for (const id of ids; index i; key id) {
			// Each row fetches its own item and suspends independently, so a slow
			// story doesn't block the whole list.
			<Suspense fallback={<RowSkeleton />}>
				<StoryItem id={id} rank={i + 1} />
			</Suspense>
		}
	</div>
}
