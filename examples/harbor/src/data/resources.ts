// The Recommendations island's data layer. The island reads these resources
// with use(); the cache decides whether a read is synchronous or suspends.
//
// The initial entry for a plan is a SEEDED thenable — `{ status: 'fulfilled',
// value, then() {} }` — which use() reads synchronously on BOTH the server and
// the hydrating client (the device the octane-compat SSR suite uses). That
// keeps first render and adoption free of suspension: the server ships the
// picks in the shell HTML and hydration adopts them without a pending arm.
//
// Only the post-hydration "Refresh picks" action swaps in a genuinely pending
// promise (fixed local delay — deterministic, no network), which is safe: the
// island is live and owns the transition with its local @pending arm. With
// `?fault=recs` the FIRST refresh rejects instead (exactly once), and the
// rejection escapes the island into the React error boundary.
import {
	RATINGS,
	RECOMMENDATIONS,
	REFRESHED_RECOMMENDATIONS,
	type Rating,
	type Recommendation,
} from './plans.ts';

/** Loose thenable shape: either a seeded synchronous read or a real Promise. */
export interface Resource<T> {
	status?: 'fulfilled';
	value?: T;
	then(onFulfilled?: (value: T) => unknown, onRejected?: (reason: unknown) => unknown): unknown;
}

function seed<T>(value: T): Resource<T> {
	return { status: 'fulfilled', value, then() {} };
}

const REFRESH_DELAY_MS = 350;

export class HarborFaultError extends Error {
	constructor() {
		super('harbor: deterministic recommendations outage');
		this.name = 'HarborFaultError';
	}
}

export function isHarborFault(error: unknown): boolean {
	return error instanceof Error && error.name === 'HarborFaultError';
}

const recommendationCache = new Map<string, Resource<Recommendation[]>>();
const ratingCache = new Map<string, Resource<Rating>>();

/** The fail-once latch: `?fault=recs` rejects only the first refresh. */
let faultConsumed = false;

function initialRecommendations(planId: string): Recommendation[] {
	return RECOMMENDATIONS[planId] ?? [];
}

export function recommendationsResource(planId: string): Resource<Recommendation[]> {
	let resource = recommendationCache.get(planId);
	if (!resource) {
		resource = seed(initialRecommendations(planId));
		recommendationCache.set(planId, resource);
	}
	return resource;
}

export function ratingResource(planId: string): Resource<Rating> {
	let resource = ratingCache.get(planId);
	if (!resource) {
		resource = seed(RATINGS[planId] ?? { score: 0, reviews: 0 });
		ratingCache.set(planId, resource);
	}
	return resource;
}

export function refreshRecommendations(
	planId: string,
	scenario: string | null,
): Resource<Recommendation[]> {
	const fail = scenario === 'recs' && !faultConsumed;
	if (fail) faultConsumed = true;
	// The island holds the returned promise in STATE and use()s it via a prop:
	// when it rejects, the island's retry pass re-reads the same rejected
	// thenable, use() throws the reason, and — with no local @catch — the
	// fault escapes the island into the React error boundary.
	const next = new Promise<Recommendation[]>((resolve, reject) => {
		setTimeout(() => {
			if (fail) {
				reject(new HarborFaultError());
			} else {
				resolve(REFRESHED_RECOMMENDATIONS[planId] ?? initialRecommendations(planId));
			}
		}, REFRESH_DELAY_MS);
	});
	recommendationCache.set(planId, next);
	return next;
}

/**
 * The error boundary's "Try again" path: reseed the caches so the remounted
 * island reads synchronously again, exactly like the first paint.
 */
export function resetRecommendations(planId: string): void {
	recommendationCache.set(planId, seed(initialRecommendations(planId)));
}
