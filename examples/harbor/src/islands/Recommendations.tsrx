// Async island: two parallel use() reads (recommendations + rating) behind a
// local @try/@pending — and deliberately NO @catch. The current
// recommendations resource lives in island STATE and reaches use() through a
// prop: octane memoizes use() argument creations on their captures, so a
// refresh must swap the resource identity itself rather than mutate a cache
// behind an unchanged expression. The initial resource is SEEDED, so server
// render and hydration read synchronously; "Refresh picks" swaps in a real
// promise. When that refresh rejects (?fault=recs, exactly once) the island's
// retry pass re-throws it out of use() and — with no @catch — the fault
// escapes into the React shell's error boundary.
import { use, useState } from 'octane';
import type { Plan, Rating, Recommendation } from '../data/plans.ts';
import {
	ratingResource,
	recommendationsResource,
	refreshRecommendations,
	type Resource,
} from '../data/resources.ts';

interface PicksBodyProps {
	picksResource: Resource<Recommendation[]>;
	ratingResource: Resource<Rating>;
}

function PicksBody(props: PicksBodyProps) @{
	const picks = use(props.picksResource);
	const rating = use(props.ratingResource);
	<>
		<p class="picks-rating">{'Rated ' + rating.score + ' by ' + rating.reviews + ' crews'}</p>
		<ul class="picks-list">
			@for (const pick of picks; key pick.id) {
				<li class="pick" data-pick={pick.id}>
					<strong class="pick-title">{pick.title}</strong>
					<span class="pick-blurb">{pick.blurb}</span>
				</li>
			}
		</ul>
	</>
}

export interface RecommendationsProps {
	plan: Plan;
	faultScenario: string | null;
}

export function Recommendations(props: RecommendationsProps) @{
	const [picksResource, setPicksResource] = useState(() => recommendationsResource(props.plan.id));
	<section class="picks" data-island="recommendations">
		<h3 class="picks-title">{'Included with ' + props.plan.name}</h3>
		@try {
			<PicksBody picksResource={picksResource} ratingResource={ratingResource(props.plan.id)} />
		} @pending {
			<p class="picks-pending">Refreshing picks…</p>
		}
		<button
			class="refresh-picks"
			onClick={() => setPicksResource(refreshRecommendations(props.plan.id, props.faultScenario))}
		>
			Refresh picks
		</button>
	</section>
}
