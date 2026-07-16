export type Month = 'apr' | 'jun' | 'oct';

export interface Destination {
	id: string;
	city: string;
	country: string;
	monogram: string;
	tagline: string;
	intro: string;
	accent: string;
	bestFor: readonly string[];
}

export interface RoutePlan {
	destinationId: string;
	arrival: string;
	departure: string;
	duration: string;
	transfer: string;
	neighbourhood: string;
	coordination: string;
}

export interface StayOption {
	id: string;
	name: string;
	area: string;
	price: string;
	note: string;
}

export interface StayPlan {
	destinationId: string;
	options: readonly StayOption[];
	coordination: string;
}

export interface WeatherOutlook {
	label: string;
	high: string;
	low: string;
	summary: string;
	packing: string;
}

export interface FareWatch {
	from: string;
	price: string;
	trend: string;
	window: string;
}

export interface PlanningRun {
	route(): Promise<RoutePlan>;
	stays(): Promise<StayPlan>;
}

const PLANNING_RUNS_STATE_KEY = 'wayfinder.planning-runs';

export const DESTINATIONS: readonly Destination[] = [
	{
		id: 'lisbon',
		city: 'Lisbon',
		country: 'Portugal',
		monogram: 'Lx',
		tagline: 'Tiled hills, late lunches, Atlantic light.',
		intro:
			'A long weekend arranged around tram-side mornings, small galleries, and a table near the water.',
		accent: 'ochre',
		bestFor: ['Food', 'Design', 'Coast'],
	},
	{
		id: 'kyoto',
		city: 'Kyoto',
		country: 'Japan',
		monogram: '京',
		tagline: 'Quiet lanes, precise gardens, unhurried tea.',
		intro:
			'An early-rising itinerary that leaves breathing room between temple gardens and neighbourhood kitchens.',
		accent: 'moss',
		bestFor: ['Craft', 'Gardens', 'Food'],
	},
	{
		id: 'copenhagen',
		city: 'Copenhagen',
		country: 'Denmark',
		monogram: 'Cph',
		tagline: 'Harbour swims, good chairs, cardamom mornings.',
		intro:
			'A bicycle-paced city break connecting thoughtful design, clean water, and bakeries worth the queue.',
		accent: 'blue',
		bestFor: ['Design', 'Cycling', 'Food'],
	},
	{
		id: 'marrakech',
		city: 'Marrakech',
		country: 'Morocco',
		monogram: 'Mk',
		tagline: 'Courtyard shade, mountain air, vivid markets.',
		intro:
			'A sensory four days with restorative riad pauses and one clear route through the old city.',
		accent: 'clay',
		bestFor: ['Markets', 'Food', 'Craft'],
	},
];

const MONTH_LABELS: Record<Month, string> = {
	apr: '18–22 April',
	jun: '12–16 June',
	oct: '09–13 October',
};

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new DOMException('Search cancelled', 'AbortError'));
			return;
		}
		const timer = setTimeout(resolve, milliseconds);
		const abort = () => {
			clearTimeout(timer);
			reject(signal?.reason ?? new DOMException('Search cancelled', 'AbortError'));
		};
		signal?.addEventListener('abort', abort, { once: true });
	});
}

function destinationOrThrow(id: string): Destination {
	const destination = DESTINATIONS.find((item) => item.id === id);
	if (destination === undefined) throw new Error('That destination is no longer in this edition.');
	return destination;
}

function routeFor(destination: Destination, month: Month): RoutePlan {
	const routeDetails: Record<
		string,
		Pick<RoutePlan, 'arrival' | 'departure' | 'transfer' | 'neighbourhood'>
	> = {
		lisbon: {
			arrival: 'Friday · 10:15 at LIS',
			departure: 'Tuesday · 18:40 from LIS',
			transfer: 'Metro to Baixa · 32 min',
			neighbourhood: 'Estrela',
		},
		kyoto: {
			arrival: 'Friday · 09:05 at Kyoto Station',
			departure: 'Tuesday · 17:12 from Kyoto Station',
			transfer: 'Karasuma line · 18 min',
			neighbourhood: 'Okazaki',
		},
		copenhagen: {
			arrival: 'Friday · 11:20 at CPH',
			departure: 'Tuesday · 16:55 from CPH',
			transfer: 'M2 to Kongens Nytorv · 21 min',
			neighbourhood: 'Christianshavn',
		},
		marrakech: {
			arrival: 'Friday · 12:30 at RAK',
			departure: 'Tuesday · 15:45 from RAK',
			transfer: 'Pre-booked riad transfer · 24 min',
			neighbourhood: 'Mouassine',
		},
	};
	const details = routeDetails[destination.id];
	if (details === undefined) throw new Error('Route details are unavailable.');
	return {
		destinationId: destination.id,
		...details,
		duration: MONTH_LABELS[month],
		coordination: `${destination.id}-${month}`,
	};
}

function staysFor(destination: Destination, month: Month): StayPlan {
	const options: Record<string, readonly StayOption[]> = {
		lisbon: [
			{
				id: 'olive-house',
				name: 'Olive House',
				area: 'Estrela',
				price: '£148 / night',
				note: 'Garden breakfast',
			},
			{
				id: 'linha-rooms',
				name: 'Linha Rooms',
				area: 'Santos',
				price: '£126 / night',
				note: 'River-facing rooms',
			},
		],
		kyoto: [
			{
				id: 'kawa-machiya',
				name: 'Kawa Machiya',
				area: 'Okazaki',
				price: '£172 / night',
				note: 'Private courtyard',
			},
			{
				id: 'nijo-house',
				name: 'Nijo House',
				area: 'Nijō',
				price: '£139 / night',
				note: 'Bicycle included',
			},
		],
		copenhagen: [
			{
				id: 'canal-house',
				name: 'Canal House 42',
				area: 'Christianshavn',
				price: '£164 / night',
				note: 'Harbour steps away',
			},
			{
				id: 'atelier-stay',
				name: 'Atelier Stay',
				area: 'Vesterbro',
				price: '£151 / night',
				note: 'Workshop interiors',
			},
		],
		marrakech: [
			{
				id: 'riad-serein',
				name: 'Riad Serein',
				area: 'Mouassine',
				price: '£118 / night',
				note: 'Shaded roof terrace',
			},
			{
				id: 'dar-azur',
				name: 'Dar Azur',
				area: 'Kasbah',
				price: '£104 / night',
				note: 'Courtyard plunge pool',
			},
		],
	};
	return {
		destinationId: destination.id,
		options: options[destination.id] ?? [],
		coordination: `${destination.id}-${month}`,
	};
}

/**
 * Creates a request-local planning handshake. Route and stays cannot complete
 * unless both loaders have started, so a successful itinerary is functional
 * evidence that independent use() creations were reached together.
 */
export function createPlanningRun(destinationId: string, month: Month): PlanningRun {
	const destination = destinationOrThrow(destinationId);
	let routeStarted = false;
	let staysStarted = false;
	let releaseBoth: (() => void) | undefined;
	const bothStarted = new Promise<void>((resolve) => {
		releaseBoth = resolve;
	});
	const markStarted = (kind: 'route' | 'stays') => {
		if (kind === 'route') routeStarted = true;
		else staysStarted = true;
		if (routeStarted && staysStarted) releaseBoth?.();
	};
	const awaitCompanion = async () => {
		await Promise.race([
			bothStarted,
			delay(700).then(() => {
				throw new Error('The route and stay planners did not start together.');
			}),
		]);
	};

	return {
		async route() {
			markStarted('route');
			await awaitCompanion();
			await delay(destinationId === 'lisbon' ? 150 : 105);
			return routeFor(destination, month);
		},
		async stays() {
			markStarted('stays');
			await awaitCompanion();
			await delay(destinationId === 'lisbon' ? 190 : 125);
			return staysFor(destination, month);
		},
	};
}

/** Keep a planning run stable across streaming SSR passes without sharing it across requests. */
export function getPlanningRun(
	requestState: Map<string, unknown> | undefined,
	destinationId: string,
	month: Month,
): PlanningRun {
	if (!(requestState instanceof Map)) return createPlanningRun(destinationId, month);
	let cache = requestState.get(PLANNING_RUNS_STATE_KEY);
	if (!(cache instanceof Map)) {
		cache = new Map<string, PlanningRun>();
		requestState.set(PLANNING_RUNS_STATE_KEY, cache);
	}
	const planningRuns = cache as Map<string, PlanningRun>;
	const key = `${destinationId}:${month}`;
	const existing = planningRuns.get(key);
	if (existing !== undefined) return existing;
	const created = createPlanningRun(destinationId, month);
	planningRuns.set(key, created);
	return created;
}

export async function loadWeather(
	destinationId: string,
	month: Month,
	scenario: string,
	attempt: number,
): Promise<WeatherOutlook> {
	const destination = destinationOrThrow(destinationId);
	await delay(destinationId === 'lisbon' ? 70 : 85);
	if (scenario === 'weather-failure' && attempt === 0) {
		throw new Error(`The ${destination.city} forecast desk did not answer.`);
	}
	const weatherByDestination: Record<string, Omit<WeatherOutlook, 'label'>> = {
		lisbon: {
			high: '23°',
			low: '16°',
			summary: 'Bright with a soft Atlantic breeze.',
			packing: 'Light knit for late terraces',
		},
		kyoto: {
			high: '19°',
			low: '11°',
			summary: 'Clear mornings, cool after dusk.',
			packing: 'A layer that fits in your day bag',
		},
		copenhagen: {
			high: '17°',
			low: '10°',
			summary: 'Fresh, changeable, bright spells.',
			packing: 'Compact rain shell',
		},
		marrakech: {
			high: '28°',
			low: '17°',
			summary: 'Dry warmth and cooler courtyards.',
			packing: 'Breathable layers and a light scarf',
		},
	};
	const outlook = weatherByDestination[destinationId];
	if (outlook === undefined) throw new Error('Forecast unavailable.');
	return { label: `${destination.city} · ${MONTH_LABELS[month]}`, ...outlook };
}

export async function loadFareWatch(destinationId: string, month: Month): Promise<FareWatch> {
	destinationOrThrow(destinationId);
	await delay(destinationId === 'lisbon' ? 330 : 255);
	const fares: Record<string, Omit<FareWatch, 'window'>> = {
		lisbon: { from: 'London Gatwick', price: '£184 return', trend: 'Steady for 6 days' },
		kyoto: { from: 'London Heathrow', price: '£692 return', trend: 'Down £38 this week' },
		copenhagen: { from: 'London City', price: '£156 return', trend: 'Two good departures left' },
		marrakech: { from: 'London Gatwick', price: '£212 return', trend: 'Likely to rise on Friday' },
	};
	const fare = fares[destinationId];
	if (fare === undefined) throw new Error('Fare watch unavailable.');
	return { ...fare, window: MONTH_LABELS[month] };
}

export async function searchDestinations(
	query: string,
	options: { signal: AbortSignal; recover: boolean },
): Promise<readonly Destination[]> {
	const normalized = query.trim().toLocaleLowerCase();
	const latency = normalized === 'lo' ? 360 : normalized === 'ky' ? 45 : 120;
	await delay(latency, options.signal);
	if ((normalized === 'outage' || normalized === 'offline') && !options.recover) {
		throw new Error('The destination desk is taking a short break.');
	}
	if (normalized === 'outage' || normalized === 'offline') return [DESTINATIONS[2]!];
	return DESTINATIONS.filter((destination) => {
		const haystack =
			`${destination.city} ${destination.country} ${destination.tagline} ${destination.bestFor.join(' ')}`.toLocaleLowerCase();
		return haystack.includes(normalized);
	});
}

export function findDestination(id: string): Destination | undefined {
	return DESTINATIONS.find((destination) => destination.id === id);
}

export function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}

export function normalizeMonth(value: string | null): Month {
	return value === 'apr' || value === 'jun' || value === 'oct' ? value : 'oct';
}
