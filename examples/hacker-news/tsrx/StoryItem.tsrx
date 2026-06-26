// Per-id fetch wrapper: the top-stories endpoint returns ids only, so each row
// loads its own item via useSuspenseQuery (cached by @octane-ts/query). Suspends
// to the enclosing <Suspense> while loading; keeps StoryRow presentational.
import { useSuspenseQuery } from '@octane-ts/query';
import { itemQuery } from '../shared/queries.js';
import { StoryRow } from './StoryRow.tsrx';

export function StoryItem({ id, rank }: { id: number; rank: number }) @{
	const { data } = useSuspenseQuery(itemQuery(id));
	<StoryRow rank={rank} story={data} />
}
