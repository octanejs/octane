import * as stylex from '@octane-ts/stylex';
import { useSuspenseQuery } from '@octane-ts/query';
import { topStoriesQuery } from '../shared/queries.ts';
import { styles } from '../shared/styles.ts';
import { Suspense } from 'octane';
import { StoryItem } from './StoryItem.tsx';

const PAGE_SIZE = 25;

export function StoriesPage() {
	// Suspends to the route's pendingComponent while the id list loads, then
	// returns `{ data }` (no loading/error branches — Suspense + an error
	// boundary handle those).
	const { data } = useSuspenseQuery(topStoriesQuery());

	const ids = data.slice(0, PAGE_SIZE);
	return (
		<div data-testid="stories-page">
			{ids.map((id, i) => (
				// Each row fetches its own item and suspends independently, so a slow
				// story doesn't block the whole list.
				<Suspense key={id} fallback={<div {...stylex.props(styles.row)}>{i + 1}. …</div>}>
					<StoryItem id={id} rank={i + 1} />
				</Suspense>
			))}
		</div>
	);
}
