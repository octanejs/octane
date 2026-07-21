import { useMemo } from 'octane';
import { Link, useRouterState } from '@octanejs/tanstack-router';
import {
	ArrowRight,
	BookOpen,
	Boxes,
	Compass,
	HelpCircle,
	Home,
	LifeBuoy,
	Newspaper,
	ShoppingBag,
	Sparkles,
} from '@octanejs/lucide';
import { twMerge } from 'tailwind-merge';
import { libraries, type LibrarySlim } from '~/libraries';
import { Button } from '~/ui';

type Accent = 'amber' | 'blue' | 'cyan' | 'emerald' | 'gray' | 'rose';

type NotFoundDestination = {
	key: string;
	label: string;
	description: string;
	href: string;
	icon: any;
	accent: Accent;
	score: number;
};

const accentStyles: Record<Accent, string> = {
	amber: 'border-amber-500/30 bg-amber-500/10 text-amber-700 hover:border-amber-500/60 dark:text-amber-300',
	blue: 'border-blue-500/30 bg-blue-500/10 text-blue-700 hover:border-blue-500/60 dark:text-blue-300',
	cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 hover:border-cyan-500/60 dark:text-cyan-300',
	emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:border-emerald-500/60 dark:text-emerald-300',
	gray: 'border-gray-300 bg-gray-100 text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-500',
	rose: 'border-rose-500/30 bg-rose-500/10 text-rose-700 hover:border-rose-500/60 dark:text-rose-300',
};

const fallbackDestinations: NotFoundDestination[] = [
	{
		key: 'libraries',
		label: 'All libraries',
		description: 'Browse TanStack Query, Router, Table, Start, and more.',
		href: '/libraries',
		icon: Boxes,
		accent: 'emerald',
		score: 1,
	},
	{
		key: 'blog',
		label: 'Blog',
		description: 'Read release notes, deep dives, and project updates.',
		href: '/blog',
		icon: Newspaper,
		accent: 'cyan',
		score: 1,
	},
	{
		key: 'support',
		label: 'Support',
		description: 'Find paid support, community help, and project resources.',
		href: '/support',
		icon: LifeBuoy,
		accent: 'amber',
		score: 1,
	},
];

const sectionDestinations: NotFoundDestination[] = [
	{
		key: 'shop',
		label: 'Shop',
		description: 'Find TanStack merch and products.',
		href: '/shop',
		icon: ShoppingBag,
		accent: 'rose',
		score: 0,
	},
	{
		key: 'showcase',
		label: 'Showcase',
		description: 'Explore projects built with TanStack.',
		href: '/showcase',
		icon: Sparkles,
		accent: 'cyan',
		score: 0,
	},
	{
		key: 'explore',
		label: 'Explore',
		description: 'Sail through the TanStack ecosystem.',
		href: '/explore',
		icon: Compass,
		accent: 'blue',
		score: 0,
	},
];

function safeDecode(value: string) {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function getPathTokens(pathname: string) {
	return new Set(safeDecode(pathname).toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean));
}

function compact(value: string) {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getLibraryAliases(library: LibrarySlim) {
	const aliases = [
		library.id,
		library.name.replace(/^TanStack\s+/i, ''),
		library.repo.split('/').at(-1) ?? '',
		library.corePackageName ?? '',
		...(library.legacyPackages ?? []),
	];

	return aliases.flatMap((alias) => alias.split(/[^a-zA-Z0-9]+/g)).map(
		(alias) => alias.toLowerCase(),
	).filter((alias) => alias.length > 1 && alias !== 'tanstack');
}

function scoreLibraryMatch(library: LibrarySlim, pathname: string) {
	const tokens = getPathTokens(pathname);
	const compactPath = compact(pathname);
	const aliases = getLibraryAliases(library);
	let score = 0;

	for (const alias of aliases) {
		if (tokens.has(alias)) {
			score += 8;
			continue;
		}

		if (alias.length > 3 && compactPath.includes(compact(alias))) {
			score += 3;
		}
	}

	return score;
}

function getLibraryDestinations(pathname: string) {
	return libraries.filter((library) => library.visible !== false).map(
		(library) => ({
			library,
			score: scoreLibraryMatch(library, pathname),
		}),
	).filter((match) => match.score > 0).sort((a, b) => b.score - a.score).slice(0, 2).flatMap(({
		library,
		score,
	}) => {
		const destinations: NotFoundDestination[] = [];

		if (library.to) {
			destinations.push({
				key: `library-${library.id}`,
				label: library.name,
				description: library.tagline,
				href: library.to,
				icon: BookOpen,
				accent: 'emerald',
				score: score + 2,
			});
		}

		if (library.latestVersion) {
			destinations.push({
				key: `library-docs-${library.id}`,
				label: `${library.name.replace(/^TanStack\s+/i, '')} docs`,
				description: 'Open the current docs for this project.',
				href: `/${library.id}/latest/docs/${library.defaultDocs ?? 'overview'}`,
				icon: BookOpen,
				accent: 'cyan',
				score: score + 1,
			});
		}

		return destinations;
	});
}

function scoreSectionDestination(destination: NotFoundDestination, pathname: string) {
	const tokens = getPathTokens(pathname);
	const keywordScores: Record<string, number> = {
		blog: 8,
		post: 4,
		article: 4,
		docs: 5,
		guide: 3,
		library: 5,
		libraries: 6,
		package: 3,
		npm: 4,
		shop: 8,
		cart: 4,
		product: 4,
		merch: 6,
		showcase: 8,
		example: 4,
		examples: 4,
		explore: 8,
		support: 8,
		help: 6,
		partner: 5,
		partners: 5,
	};

	let score = destination.score;
	for (const [keyword, value] of Object.entries(keywordScores)) {
		if (!tokens.has(keyword)) continue;

		if (
			destination.key.includes(keyword) || destination.label.toLowerCase().includes(keyword) ||
				destination.description.toLowerCase().includes(keyword)
		) {
			score += value;
		}
	}

	return score;
}

function getSectionDestinations(pathname: string) {
	const docsDestination: NotFoundDestination = {
		key: 'docs',
		label: 'Docs',
		description: 'Pick a library, then jump into its current documentation.',
		href: '/libraries',
		icon: BookOpen,
		accent: 'emerald',
		score: 0,
	};

	const helpDestination: NotFoundDestination = {
		key: 'help',
		label: 'Support',
		description: 'Get help when the missing page was supposed to unblock you.',
		href: '/support',
		icon: HelpCircle,
		accent: 'amber',
		score: 0,
	};

	return [docsDestination, helpDestination, ...sectionDestinations].map(
		(destination) => ({
			...destination,
			score: scoreSectionDestination(destination, pathname),
		}),
	).filter((destination) => destination.score > 0);
}

function getSuggestedDestinations(pathname: string) {
	const destinations = [
		...getLibraryDestinations(pathname),
		...getSectionDestinations(pathname),
		...fallbackDestinations,
	];

	const deduped = new Map<string, NotFoundDestination>();

	for (const destination of destinations) {
		const existing = deduped.get(destination.href);
		if (!existing || destination.score > existing.score) {
			deduped.set(destination.href, destination);
		}
	}

	return Array.from(deduped.values()).sort((a, b) => b.score - a.score).slice(0, 5);
}

function DestinationCard({ destination }: { destination: NotFoundDestination }) {
	const Icon = destination.icon;

	return <Link
		to={destination.href}
		className={twMerge(
			'group grid min-h-28 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md',
			accentStyles[destination.accent],
		)}
	>
		<span
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/75 shadow-sm dark:bg-black/40"
		>
			<Icon className="h-4 w-4" />
		</span>
		<span class="min-w-0">
			<span
				class="block text-sm font-semibold text-gray-950 dark:text-white"
			>{destination.label}</span>
			<span
				class="mt-1 block text-sm leading-5 text-gray-600 dark:text-gray-400"
			>{destination.description}</span>
		</span>
		<ArrowRight
			className="mt-1 h-4 w-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100"
		/>
	</Link>;
}

export function NotFound({ children }: { children?: any }) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const decodedPathname = safeDecode(pathname);
	const suggestions = useMemo(() => getSuggestedDestinations(pathname), [pathname]);

	return <div
		class="flex min-h-[calc(100dvh-var(--navbar-height))] flex-1 bg-gray-50 text-gray-950 dark:bg-gray-950 dark:text-white"
	>
		<div
			class="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 md:px-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)] lg:items-center lg:py-16"
		>
			<section class="space-y-7 lg:self-start">
				<div
					class="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-semibold uppercase text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400"
				>
					<Compass className="h-3.5 w-3.5" />
					404 Not Found
				</div>

				<div class="space-y-4">
					<h1
						class="max-w-2xl text-4xl font-black leading-tight tracking-normal text-gray-950 dark:text-white md:text-6xl"
					>
						This route is not on the map.
					</h1>
					<p class="max-w-xl text-base leading-7 text-gray-600 dark:text-gray-400 md:text-lg">
						The address might have moved, been renamed, or picked up an extra segment. I checked the
						path and found a few places that are more likely to help.
					</p>
				</div>

				<div
					class="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900"
				>
					<div class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
						Tried path
					</div>
					<div
						class="mt-2 overflow-x-auto rounded-md bg-gray-100 px-3 py-2 font-mono text-sm text-gray-700 dark:bg-black/40 dark:text-gray-300"
					>
						{decodedPathname || '/'}
					</div>
				</div>

				<div class="flex flex-wrap gap-3">
					<Button as={Link} to="/libraries" color="emerald">
						<Boxes className="h-4 w-4" />
						Browse libraries
					</Button>
					<Button as={Link} to="/support" variant="ghost">
						<LifeBuoy className="h-4 w-4" />
						Support
					</Button>
					<Button as={Link} to="/" variant="ghost">
						<Home className="h-4 w-4" />
						Home
					</Button>
				</div>

				{children ? <div>{children}</div> : null}
			</section>

			<section class="space-y-4 lg:self-start">
				<div
					class="relative min-h-[260px] overflow-hidden rounded-lg border border-gray-200/80 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
				>
					<div
						aria-hidden="true"
						class="absolute inset-0 text-gray-300 opacity-20 dark:text-gray-700 dark:opacity-15"
						style={{
							backgroundImage: 'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
							backgroundSize: '34px 34px',
						}}
					/>
					<div class="relative flex items-center justify-between gap-4">
						<div
							class="rounded-md border border-gray-200 bg-white/85 px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-black/50 dark:text-gray-300"
						>
							Route recovery
						</div>
						<div
							class="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300"
						>
							Detour ready
						</div>
					</div>

					<div class="relative mt-12 space-y-6">
						<div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
							<span
								class="h-4 w-4 rounded-full border-4 border-emerald-500 bg-white dark:bg-gray-950"
							/>
							<span class="h-px bg-linear-to-r from-emerald-500 via-cyan-500 to-amber-500" />
							<span
								class="h-4 w-4 rounded-full border-4 border-amber-500 bg-white dark:bg-gray-950"
							/>
						</div>
						<div class="grid gap-3 sm:grid-cols-3">{suggestions.slice(0, 3).map(
							(suggestion) =>
								<Link
									key={`map-${suggestion.key}`}
									to={suggestion.href}
									className="rounded-md border border-gray-200 bg-white/90 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm backdrop-blur transition-colors hover:border-emerald-500/60 hover:text-emerald-700 dark:border-gray-700 dark:bg-black/45 dark:text-gray-300 dark:hover:border-emerald-400/60 dark:hover:text-emerald-300"
								>{suggestion.label}</Link>,
						)}</div>
					</div>

					<img
						src="/images/ship.png"
						alt=""
						aria-hidden="true"
						class="absolute -right-5 -bottom-4 w-28 rotate-[-8deg] opacity-80 drop-shadow-lg md:w-36"
					/>
				</div>

				<div>
					<h2 class="text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">
						Best matches
					</h2>
					<div class="mt-3 grid gap-3">{suggestions.map(
						(suggestion) => <DestinationCard key={suggestion.key} destination={suggestion} />,
					)}</div>
				</div>
			</section>
		</div>
	</div>;
}
