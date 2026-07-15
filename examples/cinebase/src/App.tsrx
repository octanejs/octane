import { Suspense, use, useEffect, useRef, useState } from 'octane';
import type { ApolloClient, ReactiveVar } from '@octanejs/apollo-client';
import { ApolloProvider, useQuery, useReactiveVar } from '@octanejs/apollo-client/react';
import { CATALOG_QUERY, TITLE_QUERY } from './graphql.js';
import { catalogHref, parseRoute } from './routes.js';
import type { Editorial, Title } from './types.js';

export interface AppProps {
	client: ApolloClient;
	watchlist: ReactiveVar<string[]>;
	initialPath: string;
	editorialPromise: Promise<Editorial>;
}

interface NavigationProps {
	navigate: (href: string, replace?: boolean) => void;
}

function stopLinkNavigation(event: MouseEvent): boolean {
	return event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
		event.shiftKey ||
		event.altKey;
}

function AppLink(props: {
	href: string;
	class?: string;
	label?: string;
	navigate: NavigationProps['navigate'];
	children: unknown;
}) @{
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

function Brand(props: NavigationProps) @{
	<AppLink href="/" class="brand" navigate={props.navigate}>
		<span class="brand-mark" aria-hidden="true">C</span>
		<span>Cinebase</span>
	</AppLink>
}

function Header(props: NavigationProps & { watchlistCount: number }) @{
	<header class="site-header">
		<div class="header-inner">
			<Brand navigate={props.navigate} />
			<nav aria-label="Primary navigation">
				<AppLink href="/" class="nav-link" navigate={props.navigate}>Discover</AppLink>
				<AppLink href="/watchlist" class="nav-link watchlist-link" navigate={props.navigate}>
					Watchlist
					<span class="count-badge" aria-label={`${props.watchlistCount} saved titles`}>
						{props.watchlistCount as string}
					</span>
				</AppLink>
			</nav>
		</div>
	</header>
}

function OfflineBanner() @{
	const [online, setOnline] = useState(true);
	useEffect(() => {
		const sync = () => setOnline(navigator.onLine);
		sync();
		window.addEventListener('online', sync);
		window.addEventListener('offline', sync);
		return () => {
			window.removeEventListener('online', sync);
			window.removeEventListener('offline', sync);
		};
	}, []);

	@if (!online) {
		<div class="offline-banner" role="status">
			<span aria-hidden="true">●</span>
			You’re offline. Saved titles are still available.
		</div>
	}
}

function Poster(props: { title: Title; large?: boolean }) @{
	<div
		class={['poster', `poster-${props.title.poster}`, props.large && 'poster-large']}
		aria-hidden="true"
	>
		<span class="poster-grain"></span>
		<span class="poster-monogram">{props.title.name.slice(0, 1)}</span>
		<span class="poster-title">{props.title.name}</span>
	</div>
}

function WatchlistButton(props: {
	title: Title;
	watchlist: ReactiveVar<string[]>;
	compact?: boolean;
}) @{
	const ids = useReactiveVar(props.watchlist);
	const saved = ids.includes(props.title.id);
	<button
		type="button"
		class={['save-button', props.compact && 'save-button-compact', saved && 'is-saved']}
		aria-pressed={saved}
		aria-label={`${saved ? 'Remove' : 'Add'} ${props.title.name} ${
			saved ? 'from' : 'to'
		} watchlist`}
		onClick={() => {
			const next =
				saved ? ids.filter((id) => id !== props.title.id) : [...ids, props.title.id];
			props.watchlist(next);
			try {
				localStorage.setItem('cinebase:watchlist', JSON.stringify(next));
			} catch {
			}
		}}
	>
		<span aria-hidden="true">
			{saved ? '✓' : '+'}
		</span>
		{props.compact
			? ''
			: saved
				? 'In watchlist'
				: 'Add to watchlist'}
	</button>
}

function TitleCard(props: {
	title: Title;
	watchlist: ReactiveVar<string[]>;
	navigate: NavigationProps['navigate'];
}) @{
	<article class="title-card" data-title-id={props.title.id}>
		<div class="card-poster-wrap">
			<AppLink
				href={`/title/${props.title.id}`}
				label={`View ${props.title.name}`}
				navigate={props.navigate}
			>
				<Poster title={props.title} />
			</AppLink>
			<div class="card-save">
				<WatchlistButton title={props.title} watchlist={props.watchlist} compact={true} />
			</div>
		</div>
		<div class="card-copy">
			<p class="eyebrow">{`${props.title.kind} · ${props.title.year}`}</p>
			<h3>
				<AppLink
					href={`/title/${props.title.id}`}
					navigate={props.navigate}
				>{props.title.name}</AppLink>
			</h3>
			<div class="rating-row">
				<span class="rating">
					<span aria-hidden="true">★</span>

					{props.title.rating as string}
				</span>
				<span>{props.title.genres.slice(0, 2).join(' · ')}</span>
			</div>
		</div>
	</article>
}

function EditorialPanel(props: {
	promise: Promise<Editorial>;
	navigate: NavigationProps['navigate'];
}) @{
	const editorial = use(props.promise);
	<aside class="editorial" aria-labelledby="editorial-title" data-testid="streamed-editorial">
		<div>
			<p class="eyebrow accent">{editorial.kicker}</p>
			<h2 id="editorial-title">{editorial.title}</h2>
			<p>{editorial.copy}</p>
		</div>
		<AppLink href={`/title/${editorial.featuredId}`} class="text-link" navigate={props.navigate}>
			Read the feature
			<span aria-hidden="true">→</span>
		</AppLink>
	</aside>
}

function EditorialFallback() @{
	<aside class="editorial editorial-pending" aria-label="Loading Cinebase Journal">
		<div class="skeleton skeleton-short"></div>
		<div class="skeleton skeleton-long"></div>
		<div class="skeleton skeleton-medium"></div>
	</aside>
}

function CatalogPage(props: {
	search: string;
	genre: string;
	watchlist: ReactiveVar<string[]>;
	navigate: NavigationProps['navigate'];
	editorialPromise: Promise<Editorial>;
}) @{
	const searchInput = useRef<HTMLInputElement | null>(null);
	const lastSearch = useRef(props.search);
	const result = useQuery(CATALOG_QUERY, {
		variables: { search: props.search, genre: props.genre, recover: false },
		notifyOnNetworkStatusChange: true,
	});
	const titles = result.data?.catalog ?? [];
	const genres = ['All', 'Drama', 'Science fiction', 'Mystery', 'Comedy'];
	useEffect(() => {
		if (props.search === lastSearch.current) return;
		lastSearch.current = props.search;
		if (searchInput.current !== null) searchInput.current.value = props.search;
	}, [props.search]);

	<section class="catalog-page" aria-labelledby="catalog-title">
		<div class="hero-copy">
			<p class="eyebrow accent">Independent film & television</p>
			<h1 id="catalog-title">Find your next great story.</h1>
			<p class="hero-intro">
				A considered catalog of remarkable worlds, unforgettable performances, and films worth
				staying in for.
			</p>
		</div>

		<div class="catalog-tools" role="search">
			<label class="search-field">
				<span class="sr-only">Search titles</span>
				<span aria-hidden="true" class="search-icon">⌕</span>
				<input
					type="search"
					defaultValue={props.search}
					ref={searchInput}
					placeholder="Search films, series, and genres"
					onInput={(event) => {
						const search = (event.currentTarget as HTMLInputElement).value;
						props.navigate(catalogHref(search, props.genre), true);
					}}
				/>
			</label>
			<div class="genre-tabs" aria-label="Filter by genre">
				@for (const genre of genres; key genre) {
					<button
						type="button"
						class={[
							'genre-tab',
							(genre === 'All' ? props.genre === '' : props.genre === genre) && 'active',
						]}
						aria-pressed={genre === 'All' ? props.genre === '' : props.genre === genre}
						onClick={() => props.navigate(catalogHref(props.search, genre === 'All' ? '' : genre))}
					>{genre}</button>
				}
			</div>
		</div>

		@if (result.loading && result.data === undefined) {
			<div class="catalog-status" role="status" aria-live="polite">
				<div class="loader" aria-hidden="true"></div>
				<p>Searching the catalog…</p>
			</div>
		} @else if (result.error) {
			<div class="catalog-status error-state" role="alert">
				<span class="status-icon" aria-hidden="true">!</span>
				<h2>The catalog is temporarily unavailable</h2>
				<p>Your search is safe. Reconnect and try the request again.</p>
				<button
					type="button"
					class="primary-button"
					onClick={() => {
						void result.refetch({ search: props.search, genre: props.genre, recover: true });
					}}
				>
					Retry search
				</button>
			</div>
		} @else if (titles.length === 0) {
			<div class="catalog-status empty-state">
				<span class="status-icon" aria-hidden="true">○</span>
				<h2>No titles found</h2>
				<p>Try another title or clear the active filters.</p>
				<button type="button" class="secondary-button" onClick={() => props.navigate('/')}>
					Clear search
				</button>
			</div>
		} @else {
			<>
				<div class="results-heading">
					<h2>
						{props.search === '' && props.genre === '' ? 'Featured now' : 'Search results'}
					</h2>
					<p role="status">{`${titles.length} ${titles.length === 1 ? 'title' : 'titles'}`}</p>
				</div>
				<div class="title-grid">
					@for (const title of titles; key title.id) {
						<TitleCard title={title} watchlist={props.watchlist} navigate={props.navigate} />
					}
				</div>
			</>
		}

		<Suspense fallback={<EditorialFallback />}>
			<EditorialPanel promise={props.editorialPromise} navigate={props.navigate} />
		</Suspense>
	</section>
}

function TitlePage(props: {
	id: string;
	watchlist: ReactiveVar<string[]>;
	navigate: NavigationProps['navigate'];
}) @{
	const result = useQuery(TITLE_QUERY, { variables: { id: props.id } });
	const title = result.data?.title;

	<section class="detail-page" aria-live="polite">
		@if (result.loading) {
			<div class="catalog-status" role="status">
				<div class="loader"></div>
				<p>Loading title…</p>
			</div>
		} @else if (result.error) {
			<div class="catalog-status error-state" role="alert">
				<h1>We couldn’t load this title</h1>
				<button type="button" class="primary-button" onClick={() => void result.refetch()}>
					Retry
				</button>
			</div>
		} @else if (title == null) {
			<div class="catalog-status empty-state">
				<h1>That title isn’t in Cinebase</h1>
				<AppLink href="/" class="primary-button link-button" navigate={props.navigate}>
					Browse the catalog
				</AppLink>
			</div>
		} @else {
			<>
				<AppLink href="/" class="back-link" navigate={props.navigate}>
					<span aria-hidden="true">←</span>
					Back to discover
				</AppLink>
				<div class="detail-layout">
					<Poster title={title} large={true} />
					<div class="detail-copy">
						<p class="eyebrow accent">{`${title.kind} · ${title.year} · ${title.runtime}`}</p>
						<h1>{title.name}</h1>
						<p class="tagline">{title.tagline}</p>
						<div class="detail-meta">
							<span class="rating">
								<span aria-hidden="true">★</span>

								{title.rating as string}
							</span>
							<span>{title.genres.join(' · ')}</span>
						</div>
						<p class="overview">{title.overview}</p>
						<WatchlistButton title={title} watchlist={props.watchlist} />
						<div class="credits">
							<h2>Cast & crew</h2>
							<ul>
								@for (const credit of title.credits; key credit.name) {
									<li>
										<strong>{credit.name}</strong>
										<span>{credit.role}</span>
									</li>
								}
							</ul>
						</div>
					</div>
				</div>
			</>
		}
	</section>
}

function WatchlistPage(props: {
	watchlist: ReactiveVar<string[]>;
	navigate: NavigationProps['navigate'];
}) @{
	const ids = useReactiveVar(props.watchlist);
	const result = useQuery(CATALOG_QUERY, {
		variables: { search: '', genre: '', recover: true },
	});
	const saved = (result.data?.catalog ?? []).filter((title) => ids.includes(title.id));

	<section class="watchlist-page" aria-labelledby="watchlist-title">
		<p class="eyebrow accent">Your collection</p>
		<h1 id="watchlist-title">Watchlist</h1>
		<p class="hero-intro">Keep a short list of stories to return to. It stays on this device.</p>
		@if (result.loading) {
			<div class="catalog-status" role="status">
				<div class="loader"></div>
				<p>Opening your watchlist…</p>
			</div>
		} @else if (saved.length === 0) {
			<div class="catalog-status empty-state">
				<span class="status-icon" aria-hidden="true">＋</span>
				<h2>Your watchlist is ready for a first pick</h2>
				<p>Add a title from Discover and it will appear here.</p>
				<AppLink href="/" class="primary-button link-button" navigate={props.navigate}>
					Explore featured titles
				</AppLink>
			</div>
		} @else {
			<>
				<div class="results-heading">
					<h2>Saved for later</h2>
					<p>{`${saved.length} ${saved.length === 1 ? 'title' : 'titles'}`}</p>
				</div>
				<div class="title-grid">
					@for (const title of saved; key title.id) {
						<TitleCard title={title} watchlist={props.watchlist} navigate={props.navigate} />
					}
				</div>
			</>
		}
	</section>
}

function NotFoundPage(props: NavigationProps) @{
	<section class="catalog-status empty-state not-found">
		<p class="eyebrow accent">404</p>
		<h1>This reel ends here</h1>
		<p>The page you requested isn’t part of the Cinebase catalog.</p>
		<AppLink href="/" class="primary-button link-button" navigate={props.navigate}>
			Return to Discover
		</AppLink>
	</section>
}

function Shell(props: AppProps) @{
	const [path, setPath] = useState(props.initialPath);
	const [hydrated, setHydrated] = useState(false);
	const watchlistIds = useReactiveVar(props.watchlist);
	const route = parseRoute(path);

	useEffect(() => {
		setHydrated(true);
		const onPopState = () => setPath(location.pathname + location.search);
		window.addEventListener('popstate', onPopState);
		try {
			const stored = JSON.parse(localStorage.getItem('cinebase:watchlist') ?? '[]');
			if (Array.isArray(stored) && stored.every((id) => typeof id === 'string')) {
				props.watchlist(stored);
			}
		} catch {
			// A blocked or malformed store starts as an empty watchlist.
		}
		return () => window.removeEventListener('popstate', onPopState);
	}, []);

	const navigate = (href: string, replace = false) => {
		if (typeof window !== 'undefined') {
			window.history[replace ? 'replaceState' : 'pushState'](null, '', href);
			window.scrollTo({ top: 0, behavior: 'instant' });
		}
		setPath(href);
	};

	<div class="app-shell" data-app-ready={hydrated ? 'true' : 'false'}>
		<a class="skip-link" href="#main">Skip to content</a>
		<OfflineBanner />
		<Header navigate={navigate} watchlistCount={watchlistIds.length} />
		<main id="main" tabindex="-1">
			@if (route.kind === 'catalog') {
				<CatalogPage
					search={route.search}
					genre={route.genre}
					watchlist={props.watchlist}
					navigate={navigate}
					editorialPromise={props.editorialPromise}
				/>
			} @else if (route.kind === 'title') {
				<TitlePage id={route.id} watchlist={props.watchlist} navigate={navigate} />
			} @else if (route.kind === 'watchlist') {
				<WatchlistPage watchlist={props.watchlist} navigate={navigate} />
			} @else {
				<NotFoundPage navigate={navigate} />
			}
		</main>
		<footer>
			<Brand navigate={navigate} />
			<p>Thoughtful stories, carefully indexed.</p>
		</footer>
	</div>
}

export function App(props: AppProps) @{
	<ApolloProvider client={props.client}>
		<Shell {...props} />
	</ApolloProvider>
}
