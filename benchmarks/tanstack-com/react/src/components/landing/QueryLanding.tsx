import * as React from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	Activity,
	ArrowRight,
	BookOpen,
	DatabaseZap,
	Eye,
	Flame,
	GitBranch,
	Infinity as InfinityIcon,
	Network,
	Plus,
	RefreshCcw,
	RotateCcw,
	Sparkles,
} from 'lucide-react';

import { BottomCTA } from '~/components/BottomCTA';
import { Footer } from '~/components/Footer';
import { GithubIcon } from '~/components/icons/GithubIcon';
import { LandingCommunitySection } from '~/components/LandingCommunitySection';
import { SponsorSection } from '~/components/SponsorSection';
import { LibraryDownloadsMicro } from '~/components/LibraryDownloadsMicro';
import { LibraryTestimonials } from '~/components/LibraryTestimonials';
import { LibraryWordmark } from '~/components/LibraryWordmark';
import LandingPageGad from '~/components/LandingPageGad';
import { QueryGGBanner } from '~/components/QueryGGBanner';
import { getLibrary } from '~/libraries';
import { queryProject } from '~/libraries/query';
import { LandingCodeExampleCard } from '~/components/landing/LandingCodeExampleCard';
import { queryCodeExample } from '~/components/landing/codeExamples';
import { usePrefersReducedMotion } from '~/utils/usePrefersReducedMotion';

import { LandingEcosystemProof } from '~/components/landing/LandingEcosystemProof';
import { LandingCopyPromptButton } from '~/components/landing/LandingCopyPromptButton';
const library = getLibrary('query');
const queryAgentPrompt = [
	'Build a TanStack Query server-state layer for a TypeScript app.',
	'Use query keys that model the product domain, colocated query functions, mutations with optimistic updates where useful, and targeted invalidation after writes.',
	'Include loading, error, empty, background-refetch, and stale data states. Prefer framework adapters from TanStack Query and avoid storing server data in global client state.',
].join(' ');

const heroProof = [
	{
		label: 'Server-state cache',
		value: 'freshness, retries, gc, dedupe',
	},
	{
		label: 'Mutation workflow',
		value: 'optimistic UI, rollback, invalidate',
	},
	{
		label: 'Framework adapters',
		value: 'React, Vue, Solid, Svelte, Angular, Lit',
	},
];

type QueryHeroIssue = {
	id: string;
	observers: number;
	priority: number;
	title: string;
};

type QueryHeroSnapshot = {
	fetchedAt: number;
	revision: number;
	rows: Array<QueryHeroIssue>;
};

type QueryHeroMutationContext = {
	previous?: QueryHeroSnapshot;
};

const queryHeroInitialRows: Array<QueryHeroIssue> = [
	{
		id: 'router-cache',
		observers: 3,
		priority: 98,
		title: 'Router dashboard',
	},
	{
		id: 'project-detail',
		observers: 2,
		priority: 91,
		title: 'Project detail',
	},
	{
		id: 'offline-queue',
		observers: 1,
		priority: 84,
		title: 'Offline mutation queue',
	},
];

const queryHeroInitialSnapshot: QueryHeroSnapshot = {
	fetchedAt: 0,
	revision: 0,
	rows: queryHeroInitialRows,
};

const queryHeroMutationTitles = [
	'Optimistic table edit',
	'Search filter sync',
	'Background retry lane',
	'Prefetched route data',
];

const lifecycleSteps = [
	{
		label: 'Fetch',
		body: 'A query function resolves data or throws. Query owns retry, cancellation, and deduping.',
	},
	{
		label: 'Share',
		body: 'Every observer reads the same cache entry instead of refetching from every component.',
	},
	{
		label: 'Revalidate',
		body: 'Stale data can stay on screen while a background refetch quietly refreshes it.',
	},
	{
		label: 'Collect',
		body: 'Unused data sticks around long enough to feel instant, then garbage collection cleans up.',
	},
];

const featureCards = [
	{
		title: 'Important defaults do the boring work.',
		body: 'Caching, request dedupe, retries, background refetching, window-focus updates, and garbage collection are already wired for the shape of real apps.',
		icon: <Sparkles size={18} />,
	},
	{
		title: 'Query keys become the cache contract.',
		body: 'Keys describe the resource, inputs, filters, and scope so reads, writes, invalidation, prefetching, and devtools all speak the same language.',
		icon: <GitBranch size={18} />,
	},
	{
		title: 'Mutations have a real lifecycle.',
		body: 'Handle pending UI, optimistic writes, invalidation, rollback, and follow-up refetches without inventing an ad hoc client-state machine.',
		icon: <RefreshCcw size={18} />,
	},
	{
		title: 'Devtools make the cache visible.',
		body: 'See query keys, observers, freshness, retries, errors, mutations, and cache contents while the app is actually running.',
		icon: <Eye size={18} />,
	},
];

const mutationSteps = [
	{
		label: 'optimistic write',
		code: "setQueryData(['todos'], next)",
	},
	{
		label: 'server mutation',
		code: 'await saveTodo(todo)',
	},
	{
		label: 'targeted refresh',
		code: "invalidateQueries({ queryKey: ['todos'] })",
	},
	{
		label: 'rollback path',
		code: 'onError: restoreSnapshot',
	},
];

const frameworkAdapters = ['React', 'Vue', 'Solid', 'Svelte', 'Angular', 'Preact', 'Lit'];

export default function QueryLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;

	return (
		<div className="w-full min-w-0 overflow-x-hidden bg-[#fff8f3] text-zinc-950 dark:bg-zinc-950 dark:text-white">
			<section className="max-w-full overflow-hidden border-b border-red-950/10 bg-[#fff3ec] dark:border-red-300/10 dark:bg-[#130806]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.86fr_1.14fr] lg:items-start lg:py-12 xl:max-w-[92rem]">
					<div className="min-w-0 max-w-full sm:max-w-3xl">
						<SectionKicker icon={<DatabaseZap size={14} />}>Server-state manager</SectionKicker>

						<h1 className="mt-4 text-5xl font-black leading-[0.95] sm:text-6xl lg:text-7xl">
							<LibraryWordmark library={library} />
						</h1>

						<p className="mt-5 max-w-2xl text-lg font-bold leading-8 text-zinc-900 dark:text-zinc-100 sm:text-xl">
							Stop syncing server data by hand.
						</p>

						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Query gives async data a cache, a lifecycle, and a set of declarative APIs for
							fetching, sharing, refetching, mutating, and observing server state across TypeScript
							applications.
						</p>

						<LibraryDownloadsMicro
							animateIncreaseTrend
							library={library}
							className="mt-5"
							label="weekly downloads"
							period="weekly"
							showTotals
						/>

						<p className="mt-4 max-w-xl border-l-2 border-red-500 pl-3 text-sm font-black text-red-800 dark:text-red-200">
							The server-state standard for modern frontend apps.
						</p>

						<div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
							<QueryLink
								to="/$libraryId/$version/docs"
								params={{ libraryId: library.id, version: resolvedVersion }}
								label="Read the docs"
								icon={<BookOpen size={16} aria-hidden="true" />}
							/>
							<LandingCopyPromptButton prompt={queryAgentPrompt} label="Copy Query Prompt" />
						</div>

						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							{heroProof.map((proof) => (
								<ProofPill key={proof.label} {...proof} />
							))}
						</div>
						<LandingEcosystemProof />
					</div>

					<QueryCachePanel />
				</div>
			</section>

			<section className="border-b border-red-950/10 bg-[#fff7ed] dark:border-red-300/10 dark:bg-[#170b07]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.74fr_1.26fr] xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Activity size={14} />}>Why Query</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Server state is not the same problem as client state.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Server data is remote, shared, cached, refetched, invalidated, and sometimes stale on
							purpose. Query handles that lifecycle directly instead of making you recreate it with
							reducers, effects, and synchronized stores.
						</p>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						{featureCards.map((feature) => (
							<FeatureCard key={feature.title} {...feature} />
						))}
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[1.08fr_0.92fr] lg:items-center xl:max-w-[92rem]">
					<CacheLifecyclePanel />
					<div>
						<SectionKicker icon={<RotateCcw size={14} />}>Cache lifecycle</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Keep data useful while the network catches up.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Query lets stale data remain valuable. Screens can render instantly from cache,
							refetch in the background, keep previous results during pagination, and recover when
							the user comes back online.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fbfaf6] dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.82fr_1.18fr] lg:items-start xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Network size={14} />}>Mutations</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Writes update the world, then the cache.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Query keeps mutation work explicit: optimistic updates, pending states, error
							recovery, invalidation, and background reconciliation are first-class instead of
							scattered through components.
						</p>
					</div>

					<MutationPanel />
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<InfinityIcon size={14} />}>Framework adapters</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							One server-state model, every UI runtime.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							The core cache model travels across frameworks. Teams can keep the same query keys,
							invalidation strategy, mutation semantics, and mental model whether the UI is React,
							Vue, Solid, Svelte, Angular, Preact, or Lit.
						</p>
						<div className="mt-5 flex flex-wrap gap-2">
							{frameworkAdapters.map((framework) => (
								<span
									key={framework}
									className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-bold text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
								>
									{framework}
								</span>
							))}
						</div>
					</div>

					<div className="min-w-0 max-w-full overflow-hidden">
						<LandingCodeExampleCard example={queryCodeExample} />
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fff8f3] py-12 dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
					<div className="max-w-3xl">
						<SectionKicker icon={<Flame size={14} />}>Field notes</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Query is the default answer for async server state.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							The original copy was right: Query saves code by deleting whole categories of
							hand-written fetching, loading, retry, cache, and mutation logic.
						</p>
					</div>
				</div>

				<div className="mt-8">
					<LibraryTestimonials testimonials={queryProject.testimonials} />
				</div>
			</section>

			<section className="bg-white py-12 dark:bg-zinc-950">
				<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
					<div className="max-w-3xl">
						<SectionKicker icon={<GithubIcon className="h-4 w-4" />}>
							Open source ecosystem
						</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Maintainers, education, sponsors, and partners keep Query moving.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Query is built in public and taught in public. The maintainers, partner integrations,
							Query.gg, and GitHub sponsors all stay close to the product story.
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col gap-14">
					<LandingCommunitySection libraryId="query" />

					<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
						<QueryGGBanner />
					</div>

					<SponsorSection title="GitHub Sponsors" aspectRatio="1/1" packMaxWidth="900px" showCTA />
				</div>
			</section>

			<LandingPageGad />
			<BottomCTA
				linkProps={{
					to: '/$libraryId/$version/docs',
					params: { libraryId: library.id, version: resolvedVersion },
				}}
				label="Get Started!"
				className="border-red-500 bg-red-500 text-white hover:bg-red-600"
			/>
			<Footer />
		</div>
	);
}

function QueryCachePanel() {
	const prefersReducedMotion = usePrefersReducedMotion();
	const queryClient = useQueryClient();
	const serverRowsRef = React.useRef(queryHeroInitialRows);
	const serverRevisionRef = React.useRef(0);
	const mutationSequenceRef = React.useRef(0);
	const [isLive, setIsLive] = React.useState(false);
	const projectsQuery = useQuery({
		initialData: queryHeroInitialSnapshot,
		initialDataUpdatedAt: 0,
		queryFn: async (): Promise<QueryHeroSnapshot> => {
			await waitForQueryHero(620);

			return {
				fetchedAt: Date.now(),
				revision: serverRevisionRef.current,
				rows: serverRowsRef.current,
			};
		},
		queryKey: ['landing-query-hero'],
		refetchInterval: isLive ? 4200 : false,
		staleTime: 3200,
	});
	const addIssueMutation = useMutation<
		QueryHeroIssue,
		Error,
		QueryHeroIssue,
		QueryHeroMutationContext
	>({
		mutationFn: async (issue: QueryHeroIssue) => {
			await waitForQueryHero(720);
			serverRevisionRef.current += 1;
			serverRowsRef.current = [
				issue,
				...serverRowsRef.current.filter((row) => row.id !== issue.id),
			].slice(0, 5);

			return issue;
		},
		onError: (_error, _issue, context) => {
			if (context?.previous) {
				queryClient.setQueryData<QueryHeroSnapshot>(['landing-query-hero'], context.previous);
			}
		},
		onMutate: async (issue) => {
			await queryClient.cancelQueries({ queryKey: ['landing-query-hero'] });
			const previous = queryClient.getQueryData<QueryHeroSnapshot>(['landing-query-hero']);

			queryClient.setQueryData<QueryHeroSnapshot>(['landing-query-hero'], (current) => ({
				fetchedAt: current?.fetchedAt ?? 0,
				revision: current?.revision ?? serverRevisionRef.current,
				rows: [
					issue,
					...(current?.rows ?? queryHeroInitialRows).filter((row) => row.id !== issue.id),
				].slice(0, 5),
			}));

			return { previous };
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: ['landing-query-hero'] }),
	});
	const cacheState = projectsQuery.isFetching
		? 'fetching'
		: projectsQuery.isStale
			? 'stale'
			: 'fresh';
	const fetchedLabel =
		projectsQuery.data.fetchedAt > 0
			? `${Math.max(0, Math.round((Date.now() - projectsQuery.data.fetchedAt) / 1000))}s ago`
			: 'primed';

	React.useEffect(() => {
		if (prefersReducedMotion === false) {
			setIsLive(true);
		}
	}, [prefersReducedMotion]);

	const addIssue = () => {
		const nextSequence = mutationSequenceRef.current + 1;
		const nextTitle = queryHeroMutationTitles[(nextSequence - 1) % queryHeroMutationTitles.length];

		mutationSequenceRef.current = nextSequence;
		addIssueMutation.mutate({
			id: `optimistic-${nextSequence}`,
			observers: (nextSequence % 3) + 1,
			priority: 72 + ((nextSequence * 7) % 24),
			title: nextTitle,
		});
	};

	return (
		<div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-red-200 bg-white p-4 shadow-sm shadow-red-950/5 dark:border-red-900 dark:bg-zinc-950">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				</div>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">query client</span>
			</div>

			<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap gap-2">
					<span
						className={
							cacheState === 'fresh'
								? 'rounded-md bg-emerald-100 px-3 py-2 text-xs font-black uppercase text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
								: cacheState === 'fetching'
									? 'rounded-md bg-amber-100 px-3 py-2 text-xs font-black uppercase text-amber-800 dark:bg-amber-950/50 dark:text-amber-200'
									: 'rounded-md bg-red-100 px-3 py-2 text-xs font-black uppercase text-red-800 dark:bg-red-950/50 dark:text-red-200'
						}
					>
						{cacheState}
					</span>
					<span className="rounded-md border border-zinc-200 px-3 py-2 text-xs font-black uppercase text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
						rev {projectsQuery.data.revision} / {fetchedLabel}
					</span>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						aria-pressed={isLive}
						className={
							isLive
								? 'rounded-md border border-red-500 bg-red-500 px-3 py-2 text-xs font-black text-white'
								: 'rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-700 transition-colors hover:border-red-300 hover:text-red-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-red-700 dark:hover:text-red-200'
						}
						type="button"
						onClick={() => setIsLive((current) => !current)}
					>
						Live {isLive ? 'on' : 'off'}
					</button>
					<button
						className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-700 transition-colors hover:border-red-300 hover:text-red-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-red-700 dark:hover:text-red-200"
						type="button"
						onClick={() => projectsQuery.refetch()}
					>
						<RefreshCcw
							aria-hidden="true"
							className={projectsQuery.isFetching ? 'animate-spin' : ''}
							size={14}
						/>
						Refetch
					</button>
					<button
						className="inline-flex items-center gap-2 rounded-md border border-red-500 bg-red-500 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-red-600 disabled:cursor-wait disabled:opacity-70"
						disabled={addIssueMutation.isPending}
						type="button"
						onClick={addIssue}
					>
						<Plus aria-hidden="true" size={14} />
						Add issue
					</button>
				</div>
			</div>

			<div className="mt-4 grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
				<div className="space-y-2">
					{projectsQuery.data.rows.map((row) => (
						<div
							key={row.id}
							className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="truncate font-mono text-sm font-black text-zinc-950 dark:text-white">
										['issues', '{row.id}']
									</p>
									<p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
										{row.title}
									</p>
								</div>
								<span className="shrink-0 rounded-md bg-red-100 px-2 py-1 text-[0.65rem] font-black uppercase text-red-800 dark:bg-red-950 dark:text-red-200">
									p{row.priority}
								</span>
							</div>
							<div className="mt-3 flex items-center gap-1.5">
								{Array.from({ length: row.observers }).map((_, index) => (
									<span key={index} className="h-2 flex-1 rounded-full bg-red-400/80" />
								))}
								<span className="ml-2 text-[0.65rem] font-black uppercase text-zinc-500 dark:text-zinc-400">
									{row.observers} observers
								</span>
							</div>
						</div>
					))}
				</div>

				<div className="grid content-between gap-3 rounded-lg bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/25 dark:text-amber-100">
					<div>
						<p className="text-sm font-black">useQuery()</p>
						<p className="mt-2 text-xs leading-5 text-amber-950/75 dark:text-amber-100/75">
							Components declare the data they need. The cache coordinates fetches, subscribers,
							freshness, and background updates.
						</p>
					</div>

					<div className="space-y-2 text-xs font-bold">
						{[
							`status: ${projectsQuery.status}`,
							`isFetching: ${projectsQuery.isFetching}`,
							'staleTime: 3_200',
							`mutation: ${addIssueMutation.status}`,
						].map((item) => (
							<div
								key={item}
								className="rounded-md bg-white/80 px-3 py-2 font-mono dark:bg-zinc-950/70"
							>
								{item}
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function waitForQueryHero(ms: number) {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
}

function CacheLifecyclePanel() {
	return (
		<div className="min-w-0 rounded-lg border border-red-200 bg-white p-4 dark:border-red-900 dark:bg-zinc-950">
			<div className="grid gap-3 sm:grid-cols-4">
				{lifecycleSteps.map((step, index) => (
					<div
						key={step.label}
						className="rounded-lg border border-zinc-200 bg-[#fffaf4] p-4 dark:border-zinc-800 dark:bg-zinc-900"
					>
						<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-sm font-black text-red-800 dark:bg-red-950 dark:text-red-200">
							{index + 1}
						</span>
						<h3 className="mt-4 text-lg font-black leading-tight">{step.label}</h3>
						<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{step.body}</p>
					</div>
				))}
			</div>

			<div className="mt-4 rounded-lg bg-zinc-950 p-4 text-sm text-red-100 dark:bg-black">
				<p className="font-mono leading-6">
					<span className="text-red-300">queryKey</span>: ['projects', filters]
					<br />
					<span className="text-amber-300">queryFn</span>: fetchProjects
					<br />
					staleTime: 30_000
					<br />
					gcTime: 300_000
				</p>
			</div>
		</div>
	);
}

function MutationPanel() {
	return (
		<div className="min-w-0 rounded-lg border border-red-200 bg-white p-4 dark:border-red-900 dark:bg-zinc-950">
			<div className="grid gap-3 md:grid-cols-2">
				{mutationSteps.map((step, index) => (
					<div
						key={step.label}
						className="rounded-lg border border-zinc-200 bg-[#fffaf4] p-4 dark:border-zinc-800 dark:bg-zinc-900"
					>
						<div className="flex items-center justify-between gap-3">
							<span className="rounded-md bg-red-100 px-2 py-1 text-xs font-black text-red-800 dark:bg-red-950 dark:text-red-200">
								{index + 1}
							</span>
							<span className="text-[0.65rem] font-black uppercase text-zinc-500 dark:text-zinc-400">
								{step.label}
							</span>
						</div>
						<p className="mt-4 break-words font-mono text-sm font-black leading-6 text-zinc-950 dark:text-white">
							{step.code}
						</p>
					</div>
				))}
			</div>

			<div className="mt-4 rounded-lg bg-red-50 p-4 text-sm font-bold leading-6 text-red-950 dark:bg-red-950/30 dark:text-red-100">
				Result: the UI can feel instant, the server remains the source of truth, and the cache knows
				exactly what changed.
			</div>
		</div>
	);
}

function FeatureCard({
	body,
	icon,
	title,
}: {
	body: string;
	icon: React.ReactNode;
	title: string;
}) {
	return (
		<div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
			<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200">
				{icon}
			</span>
			<h3 className="mt-4 text-xl font-black leading-tight">{title}</h3>
			<p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
		</div>
	);
}

function SectionKicker({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
	return (
		<p className="inline-flex items-center gap-2 text-sm font-black uppercase text-red-700 dark:text-red-300">
			{icon}
			{children}
		</p>
	);
}

function ProofPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-l-2 border-red-500 pl-3">
			<p className="text-sm font-black text-zinc-950 dark:text-white">{label}</p>
			<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value}</p>
		</div>
	);
}

function QueryLink({
	icon,
	label,
	params,
	to,
}: {
	icon: React.ReactNode;
	label: string;
	params: Record<string, string>;
	to: string;
}) {
	return (
		<Link
			to={to}
			params={params}
			className="inline-flex w-full max-w-full items-center justify-center gap-2 rounded-lg border border-zinc-950 bg-zinc-950 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 sm:w-auto"
		>
			{icon}
			{label}
			<ArrowRight size={15} aria-hidden="true" />
		</Link>
	);
}
