// Deterministic local fixtures. Everything Harbor renders comes from this
// module — server and client read the same data, and the e2e journeys never
// touch a network.

export interface Plan {
	id: string;
	name: string;
	tagline: string;
	/** Monthly price per seat, in whole currency units (formatted per locale). */
	pricePerSeat: number;
}

export interface Recommendation {
	id: string;
	title: string;
	blurb: string;
}

export interface Rating {
	score: number;
	reviews: number;
}

export const PLANS: Plan[] = [
	{ id: 'crew', name: 'Crew', tagline: 'For small teams finding their course.', pricePerSeat: 24 },
	{ id: 'fleet', name: 'Fleet', tagline: 'For teams shipping every day.', pricePerSeat: 48 },
];

/** The plan the configurator island operates on. */
export const FEATURED_PLAN: Plan = PLANS[1];

export const RECOMMENDATIONS: Record<string, Recommendation[]> = {
	fleet: [
		{ id: 'sso', title: 'Single sign-on', blurb: 'Bring your identity provider along.' },
		{ id: 'audit', title: 'Audit log', blurb: 'Every action, accounted for.' },
		{ id: 'priority', title: 'Priority support', blurb: 'A human within the hour.' },
	],
};

/** A different set, so a completed refresh is observable in the UI. */
export const REFRESHED_RECOMMENDATIONS: Record<string, Recommendation[]> = {
	fleet: [
		{ id: 'sandbox', title: 'Sandbox environments', blurb: 'Rehearse before you deploy.' },
		{ id: 'insights', title: 'Usage insights', blurb: 'See where the seats sail.' },
		{ id: 'backup', title: 'Managed backups', blurb: 'Yesterday, on demand.' },
	],
};

export const RATINGS: Record<string, Rating> = {
	fleet: { score: 4.8, reviews: 1284 },
};
