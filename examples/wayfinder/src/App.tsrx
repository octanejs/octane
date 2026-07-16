import { use, useCallback, useEffect, useMemo, useRef, useState } from 'octane';
import {
	DESTINATIONS,
	findDestination,
	getPlanningRun,
	isAbortError,
	loadFareWatch,
	loadWeather,
	normalizeMonth,
	searchDestinations,
} from './data.ts';
import './styles.css';

const SAVED_STORAGE_KEY = 'wayfinder:saved:v1';
const NOTES_STORAGE_KEY = 'wayfinder:notes:v1';

function parseRoute(value) {
	const url = new URL(value, 'https://wayfinder.local');
	const scenario = url.searchParams.get('scenario') ?? '';
	if (url.pathname === '/') return { name: 'discover', scenario };
	if (url.pathname === '/saved') return { name: 'saved', scenario };
	const tripMatch = /^\/trips\/([^/]+)$/.exec(url.pathname);
	if (tripMatch !== null) {
		return {
			name: 'trip',
			tripId: decodeURIComponent(tripMatch[1]),
			month: normalizeMonth(url.searchParams.get('month')),
			scenario,
		};
	}
	return { name: 'not-found', scenario };
}

function stopLinkNavigation(event) {
	return event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
		event.shiftKey ||
		event.altKey;
}

function readStringArray(key) {
	try {
		const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
		return Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')
			? parsed
			: [];
	} catch {
		return [];
	}
}

function readNote(tripId) {
	try {
		const parsed = JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) ?? '{}');
		return parsed !== null && typeof parsed === 'object' && typeof parsed[tripId] === 'string'
			? parsed[tripId]
			: '';
	} catch {
		return '';
	}
}

function writeNotes(tripId, note) {
	try {
		const parsed = JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) ?? '{}');
		const notes =
			parsed !== null && typeof parsed === 'object' ? parsed : {};
		notes[tripId] = note;
		localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
		return true;
	} catch {
		return false;
	}
}

function AppLink(props) @{
	<a
		href={props.href}
		class={props.class}
		aria-label={props.label}
		onClick={(event) => {
			if (stopLinkNavigation(event)) return;
			event.preventDefault();
			props.navigate(props.href);
		}}
	>{props.children}</a>
}

function Mark() @{
	<span class="mark" aria-hidden="true">
		<span></span>
		<span></span>
	</span>
}

function Header(props) @{
	<header class="site-header">
		<div class="header-inner">
			<AppLink href="/" class="brand" navigate={props.navigate}>
				<Mark />
				<span>Wayfinder</span>
			</AppLink>
			<nav aria-label="Primary navigation">
				<AppLink href="/" class="nav-link" navigate={props.navigate}>Explore</AppLink>
				<AppLink
					href="/trips/lisbon?month=oct"
					class="nav-link quick-link"
					navigate={props.navigate}
				>
					Lisbon
				</AppLink>
				<AppLink
					href="/trips/kyoto?month=oct"
					class="nav-link quick-link"
					navigate={props.navigate}
				>
					Kyoto
				</AppLink>
				<AppLink
					href="/saved"
					class="saved-link"
					label={`Saved, ${props.savedCount} saved ${props.savedCount === 1 ? 'trip' : 'trips'}`}
					navigate={props.navigate}
				>
					Saved
					<span aria-label={`${props.savedCount} saved trips`}>
						{props.savedCount as string}
					</span>
				</AppLink>
			</nav>
		</div>
	</header>
}

function DestinationArtwork(props) @{
	<div class={['destination-art', `art-${props.destination.accent}`]} aria-hidden="true">
		<div class="art-sun"></div>
		<div class="art-line art-line-one"></div>
		<div class="art-line art-line-two"></div>
		<span>{props.destination.monogram}</span>
	</div>
}

function DestinationCard(props) @{
	<article class="destination-card" data-destination-id={props.destination.id}>
		<AppLink
			href={`/trips/${props.destination.id}?month=oct`}
			class="card-art-link"
			label={`Plan a trip to ${props.destination.city}`}
			navigate={props.navigate}
		>
			<DestinationArtwork destination={props.destination} />
		</AppLink>
		<div class="card-copy">
			<p class="eyebrow">{props.destination.country}</p>
			<h3>
				<AppLink
					href={`/trips/${props.destination.id}?month=oct`}
					navigate={props.navigate}
				>{props.destination.city}</AppLink>
			</h3>
			<p>{props.destination.tagline}</p>
			<p class="card-tags">
				{props.destination.bestFor.join(' · ') as string}
			</p>
		</div>
	</article>
}

function DiscoverPage(props) @{
	const [query, setQuery] = useState('');
	const [result, setResult] = useState({ status: 'idle', items: DESTINATIONS, message: '' });
	const [abortNotice, setAbortNotice] = useState('');
	const activeSearch = useRef(null);

	const runSearch = (nextQuery, recover = false) => {
		setQuery(nextQuery);
		if (activeSearch.current !== null) {
			activeSearch.current.abort(new DOMException('Superseded by a newer search', 'AbortError'));
			activeSearch.current = null;
			setAbortNotice(
				'An older search was cancelled; only the latest request can update this list.',
			);
		}
		const normalized = nextQuery.trim();
		if (normalized === '') {
			setResult({ status: 'idle', items: DESTINATIONS, message: '' });
			return;
		}
		const controller = new AbortController();
		activeSearch.current = controller;
		setResult({ status: 'loading', items: [], message: `Looking for ${normalized}…` });
		void searchDestinations(normalized, { signal: controller.signal, recover }).then(
			(items) => {
				if (activeSearch.current !== controller) return;
				activeSearch.current = null;
				setResult({ status: items.length === 0 ? 'empty' : 'ready', items, message: '' });
			},
			(error) => {
				if (activeSearch.current !== controller || isAbortError(error)) return;
				activeSearch.current = null;
				setResult({
					status: 'error',
					items: [],
					message: error instanceof Error ? error.message : 'Destination search failed.',
				});
			},
		);
	};

	useEffect(() => () => activeSearch.current?.abort(), []);

	<main id="main-content" class="discover-page">
		<section class="hero">
			<div class="hero-copy">
				<p class="eyebrow eyebrow-accent">Small journeys, properly considered</p>
				<h1>
					Go somewhere.
					<br />
					Keep room for wonder.
				</h1>
				<p>
					Thoughtful city breaks with the route, stay, weather, and fare shaped into one unhurried
					plan.
				</p>
			</div>
			<div class="hero-stamp" aria-label="Four locally researched city editions">
				<span>04</span>
				<p>
					city editions
					<br />
					for this season
				</p>
			</div>
		</section>

		<section class="search-panel" aria-labelledby="search-heading">
			<div>
				<p class="eyebrow">Where next?</p>
				<h2 id="search-heading">Find a city by feeling.</h2>
			</div>
			<label class="search-field">
				<span class="sr-only">Search destinations</span>
				<span aria-hidden="true">⌕</span>
				<input
					type="search"
					value={query}
					placeholder="Try Kyoto, coast, or design"
					onInput={(event) => runSearch(event.currentTarget.value)}
				/>
			</label>
		</section>

		@if (abortNotice !== '') {
			<p class="request-notice" role="status">{abortNotice}</p>
		}
		@if (result.status === 'loading') {
			<section class="collection-state" role="status" aria-live="polite">
				<span class="compass-loader" aria-hidden="true"></span>
				<h2>{result.message}</h2>
				<p>We will keep this request separate from anything you type next.</p>
			</section>
		} @else if (result.status === 'error') {
			<section class="collection-state collection-error" role="alert">
				<p class="eyebrow">Search paused</p>
				<h2>The destination desk did not answer.</h2>
				<p>{result.message}</p>
				<button class="button button-dark" type="button" onClick={() => runSearch(query, true)}>
					Retry destination search
				</button>
			</section>
		} @else if (result.status === 'empty') {
			<section class="collection-state">
				<p class="eyebrow">No close match</p>
				<h2>That feeling is not in this season’s edition.</h2>
				<p>Clear the search to browse every considered route.</p>
				<button class="button button-light" type="button" onClick={() => runSearch('')}>
					Show every city
				</button>
			</section>
		} @else {
			<section class="destination-section" aria-labelledby="destinations-heading">
				<div class="section-heading">
					<div>
						<p class="eyebrow">The current collection</p>
						<h2 id="destinations-heading">
							{query === '' ? 'Four ways to change the pace.' : `Matches for “${query}”.`}
						</h2>
					</div>
					<p role="status">{`${result.items.length} ${
						result.items.length === 1 ? 'route' : 'routes'
					}`}</p>
				</div>
				<div class="destination-grid">
					@for (const destination of result.items; key destination.id) {
						<DestinationCard destination={destination} navigate={props.navigate} />
					}
				</div>
			</section>
		}
	</main>
}

function PlanningFallback(props) @{
	<section class="plan-card plan-loading" role="status" aria-live="polite">
		<div class="plan-loading-mark">
			<span></span>
		</div>
		<div>
			<p class="eyebrow">Building the shared plan</p>
			<h2>{`Pairing the route and stays for ${props.city}…`}</h2>
			<p>Both independent requests must be ready before this itinerary can open.</p>
		</div>
	</section>
}

function PairedPlan(props) @{
	<section class="plan-card" data-parallel-plan="ready" aria-labelledby="plan-heading">
		@try {
			const route = use(props.run.route());
			const stays = use(props.run.stays());
			<>
				<div class="plan-heading">
					<div>
						<p class="eyebrow eyebrow-accent">One coordinated planning pass</p>
						<h2 id="plan-heading">The shape of the trip.</h2>
					</div>
					<span class="coordination-badge">Route + stays ready together</span>
				</div>
				<div class="route-grid">
					<div>
						<p class="label">Dates</p>
						<strong>{route.duration}</strong>
					</div>
					<div>
						<p class="label">Arrive</p>
						<strong>{route.arrival}</strong>
					</div>
					<div>
						<p class="label">Leave</p>
						<strong>{route.departure}</strong>
					</div>
					<div>
						<p class="label">First move</p>
						<strong>{route.transfer}</strong>
					</div>
				</div>
				<div class="stay-heading">
					<h3>{`Stay near ${route.neighbourhood}`}</h3>
					<p>Two small places with a clear sense of where they are.</p>
				</div>
				<div class="stay-grid">
					@for (const stay of stays.options; key stay.id) {
						<article class="stay-option" data-stay-id={stay.id}>
							<div>
								<p class="eyebrow">{stay.area}</p>
								<h4>{stay.name}</h4>
								<p>{stay.note}</p>
							</div>
							<strong>{stay.price}</strong>
						</article>
					}
				</div>
			</>
		} @pending {
			<PlanningFallback city={props.city} />
		} @catch (error) {
			<div class="inline-error" role="alert">
				<p class="eyebrow">Planning interrupted</p>
				<h2>Route and stays could not be paired.</h2>
				<p>
					{error.message as string}
				</p>
			</div>
		}
	</section>
}

function FareRegion(props) @{
	<section class="insight-card fare-card" aria-labelledby="fare-heading">
		@try {
			const fare = use(loadFareWatch(props.destinationId, props.month));
			<div data-stream-region="fare">
				<div class="insight-heading">
					<p class="eyebrow">Fare watch</p>
					<span aria-hidden="true">↘</span>
				</div>
				<h2 id="fare-heading">A sensible window from {fare.from}.</h2>
				<p class="insight-number">{fare.price}</p>
				<p>{fare.trend}</p>
				<p class="insight-meta">{fare.window}</p>
			</div>
		} @pending {
			<div class="insight-pending" role="status">
				<p class="eyebrow">Fare watch</p>
				<h2>Comparing flexible fares…</h2>
				<p>Checking useful departures, not simply the cheapest seat.</p>
			</div>
		} @catch (error) {
			<div class="inline-error" role="alert">
				<h2>Fare watch is resting.</h2>
				<p>
					{error.message as string}
				</p>
			</div>
		}
	</section>
}

function WeatherRegion(props) @{
	const [attempt, setAttempt] = useState(0);
	<section class="insight-card weather-card" aria-labelledby="weather-heading">
		@try {
			const weather = use(loadWeather(props.destinationId, props.month, props.scenario, attempt));
			<div data-stream-region="weather">
				<div class="insight-heading">
					<p class="eyebrow">Coastal outlook</p>
					<span aria-hidden="true">☼</span>
				</div>
				<h2 id="weather-heading">{weather.summary}</h2>
				<p class="insight-number">{`${weather.high} / ${weather.low}`}</p>
				<p>{weather.packing}</p>
				<p class="insight-meta">{weather.label}</p>
			</div>
		} @pending {
			<div class="insight-pending" role="status">
				<p class="eyebrow">Coastal outlook</p>
				<h2>Checking the local weather…</h2>
				<p>A smaller bag begins with a useful forecast.</p>
			</div>
		} @catch (error, reset) {
			<div class="inline-error weather-error" role="alert">
				<p class="eyebrow">Forecast unavailable</p>
				<h2>The local weather desk did not answer.</h2>
				<p>
					{error.message as string}
				</p>
				<button
					class="button button-light"
					type="button"
					onClick={() => {
						setAttempt((current) => current + 1);
						reset();
					}}
				>
					Retry local forecast
				</button>
			</div>
		}
	</section>
}

function TripPage(props) @{
	const destination = findDestination(props.tripId);
	const noteInput = useRef(null);
	const noteTrip = useRef(props.tripId);
	const storageNoteReady = useRef(false);
	const [noteStatus, setNoteStatus] = useState('');
	const planningRun = useMemo(
		() => destination === undefined
			? null
			: getPlanningRun(props.requestState, destination.id, props.month),
		[props.requestState, destination?.id, props.month],
	);
	useEffect(() => {
		if (!props.storageReady || noteInput.current === null) return;
		if (!storageNoteReady.current) {
			storageNoteReady.current = true;
			noteTrip.current = props.tripId;
			if (noteInput.current.value === '') noteInput.current.value = readNote(props.tripId);
			return;
		}
		if (noteTrip.current === props.tripId) return;
		noteTrip.current = props.tripId;
		noteInput.current.value = readNote(props.tripId);
		setNoteStatus('');
	}, [props.tripId, props.storageReady]);

	@if (destination === undefined || planningRun === null) {
		<main id="main-content" class="not-found-page">
			<p class="eyebrow eyebrow-accent">Route not found</p>
			<h1>This path has slipped beyond the map.</h1>
			<p>Choose a city from the current Wayfinder edition and begin again.</p>
			<AppLink href="/" class="button button-dark" navigate={props.navigate}>
				Return to the collection
			</AppLink>
		</main>
	} @else {
		<main id="main-content" class="trip-page" data-trip-id={destination.id}>
			<section class={['trip-hero', `trip-${destination.accent}`]}>
				<div class="trip-hero-copy">
					<AppLink href="/" class="back-link" navigate={props.navigate}>
						← All city editions
					</AppLink>
					<p class="eyebrow">{destination.country}</p>
					<h1 data-itinerary-title="true">{destination.city}</h1>
					<p>{destination.intro}</p>
					<div class="trip-actions">
						<button
							class={['button', props.saved ? 'button-saved' : 'button-dark']}
							type="button"
							aria-pressed={props.saved}
							onClick={() => props.toggleSaved(destination.id)}
						>
							{props.saved ? 'Saved to your journeys' : 'Save this journey'}
						</button>
						<label class="month-select">
							<span>Travel month</span>
							<select
								value={props.month}
								onInput={(event) => {
									props.navigate(`/trips/${destination.id}?month=${event.currentTarget.value}`);
								}}
							>
								<option value="apr">April</option>
								<option value="jun">June</option>
								<option value="oct">October</option>
							</select>
						</label>
					</div>
				</div>
				<DestinationArtwork destination={destination} />
			</section>

			<PairedPlan run={planningRun} city={destination.city} />

			<section class="insights-grid" aria-label="Live trip insights">
				<FareRegion destinationId={destination.id} month={props.month} />
				<WeatherRegion
					destinationId={destination.id}
					month={props.month}
					scenario={props.scenario}
				/>
			</section>

			<section class="day-plan" aria-labelledby="day-plan-heading">
				<div class="section-heading">
					<div>
						<p class="eyebrow">A day with space in it</p>
						<h2 id="day-plan-heading">Three anchors, nothing rushed.</h2>
					</div>
					<span class="edition-number">01 / 03</span>
				</div>
				<ol>
					<li>
						<span>08:30</span>
						<div>
							<h3>Begin near the neighbourhood market</h3>
							<p>Coffee, fruit, and the city arriving at its own pace.</p>
						</div>
					</li>
					<li>
						<span>11:00</span>
						<div>
							<h3>Follow one craft through the old streets</h3>
							<p>A small museum, a maker’s studio, then no appointment at all.</p>
						</div>
					</li>
					<li>
						<span>18:45</span>
						<div>
							<h3>Keep the evening close to home</h3>
							<p>A local table and a walk back through familiar corners.</p>
						</div>
					</li>
				</ol>
			</section>

			<section class="trip-notes" aria-labelledby="notes-heading">
				<div>
					<p class="eyebrow">Make it yours</p>
					<h2 id="notes-heading">Leave a note for later.</h2>
					<p>Notes stay on this device and survive a return to the deep link.</p>
				</div>
				<div class="note-form">
					<label for="trip-note">Trip note</label>
					<textarea
						id="trip-note"
						data-trip-note="true"
						ref={noteInput}
						defaultValue={props.initialNote}
						placeholder="A restaurant, a book, a person to call…"
					></textarea>
					<button
						class="button button-dark"
						type="button"
						onClick={() => {
							const note = noteInput.current?.value ?? '';
							setNoteStatus(
								writeNotes(destination.id, note)
									? 'Note saved on this device.'
									: 'This browser blocked note storage; the text remains here.',
							);
						}}
					>
						Save trip note
					</button>
					<p class="note-status" role="status">{noteStatus}</p>
				</div>
			</section>
		</main>
	}
}

function SavedPage(props) @{
	const savedDestinations = DESTINATIONS.filter(
		(destination) => props.saved.includes(destination.id),
	);
	<main id="main-content" class="saved-page">
		<div class="saved-heading">
			<p class="eyebrow eyebrow-accent">Kept for later</p>
			<h1>Your saved journeys.</h1>
			<p>A small shelf of routes stored only in this browser.</p>
		</div>
		@if (!props.storageReady) {
			<section class="collection-state" role="status">
				<span class="compass-loader" aria-hidden="true"></span>
				<h2>Opening your journey shelf…</h2>
			</section>
		} @else if (savedDestinations.length === 0) {
			<section class="collection-state">
				<p class="eyebrow">Nothing saved yet</p>
				<h2>Leave room for the first possibility.</h2>
				<p>Save a city plan and it will wait here on this device.</p>
				<AppLink href="/" class="button button-dark" navigate={props.navigate}>
					Explore the collection
				</AppLink>
			</section>
		} @else {
			<div class="destination-grid saved-grid">
				@for (const destination of savedDestinations; key destination.id) {
					<DestinationCard destination={destination} navigate={props.navigate} />
				}
			</div>
		}
	</main>
}

function Footer(props) @{
	<footer class="site-footer">
		<div class="brand">
			<Mark />
			<span>Wayfinder</span>
		</div>
		<p>Deterministic journeys. No live booking service.</p>
		<AppLink href="/trips/copenhagen?month=jun" navigate={props.navigate}>
			Take me somewhere considered →
		</AppLink>
	</footer>
}

export function App(props) @{
	const initialUrl = props.url ?? '/';
	const [route, setRoute] = useState(() => parseRoute(initialUrl));
	const [saved, setSaved] = useState([]);
	const [storageReady, setStorageReady] = useState(false);
	const [hydrated, setHydrated] = useState(false);

	const navigate = useCallback((href) => {
		history.pushState(null, '', href);
		setRoute(parseRoute(href));
		window.scrollTo({ top: 0, behavior: 'instant' });
	}, []);

	const toggleSaved = (destinationId) => {
		setSaved((current) => {
			const next =
				current.includes(destinationId)
					? current.filter((id) => id !== destinationId)
					: [...current, destinationId];
			try {
				localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(next));
			} catch {
			}
			return next;
		});
	};

	useEffect(() => {
		setSaved(readStringArray(SAVED_STORAGE_KEY));
		setStorageReady(true);
		setHydrated(true);
		const onPopState = () => setRoute(parseRoute(window.location.href));
		window.addEventListener('popstate', onPopState);
		return () => window.removeEventListener('popstate', onPopState);
	}, []);

	<div
		class="app"
		data-hydrated={hydrated ? 'true' : 'false'}
		data-app-ready={storageReady ? 'true' : 'false'}
	>
		<a class="skip-link" href="#main-content">Skip to main content</a>
		<Header navigate={navigate} savedCount={saved.length} />
		@if (route.name === 'discover') {
			<DiscoverPage navigate={navigate} scenario={route.scenario} />
		} @else if (route.name === 'trip') {
			<TripPage
				tripId={route.tripId}
				month={route.month}
				scenario={route.scenario}
				navigate={navigate}
				saved={saved.includes(route.tripId)}
				toggleSaved={toggleSaved}
				initialNote=""
				storageReady={storageReady}
				requestState={props.state}
			/>
		} @else if (route.name === 'saved') {
			<SavedPage saved={saved} storageReady={storageReady} navigate={navigate} />
		} @else {
			<main id="main-content" class="not-found-page">
				<p class="eyebrow eyebrow-accent">404 · beyond this edition</p>
				<h1>We have not walked that road yet.</h1>
				<AppLink href="/" class="button button-dark" navigate={navigate}>
					Return to Wayfinder
				</AppLink>
			</main>
		}
		<Footer navigate={navigate} />
	</div>
}
