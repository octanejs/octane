import { useState } from 'octane';
import { Link, useParams } from '@octanejs/tanstack-router';
import {
	ArrowRight,
	BookOpen,
	Boxes,
	DatabaseZap,
	Link as LinkIcon,
	ListTree,
	MousePointerClick,
	Route,
	Search,
	Sparkles,
} from '@octanejs/lucide';

import { BottomCTA } from '~/components/BottomCTA.tsrx';
import { ApplicationStarter } from '~/components/ApplicationStarter.tsrx';
import { Footer } from '~/components/Footer.tsrx';
import { GithubIcon } from '~/components/icons/GithubIcon.tsrx';
import { LandingCommunitySection } from '~/components/LandingCommunitySection.tsrx';
import { SponsorSection } from '~/components/SponsorSection.tsrx';
import { LibraryDownloadsMicro } from '~/components/LibraryDownloadsMicro.tsrx';
import { LibraryWordmark } from '~/components/LibraryWordmark.tsrx';
import { getLibrary } from '~/libraries';
import {
	getApplicationStarterSuggestions,
	resolveApplicationStarterDeterministically,
} from '~/utils/application-starter';

import { LandingEcosystemProof } from '~/components/landing/LandingEcosystemProof.tsrx';
import { LandingCopyPromptButton } from '~/components/landing/LandingCopyPromptButton.tsrx';

const library = getLibrary('router');
const routerBlankStarterInput = getRouterBlankStarterInput();

let cachedRouterAgentPrompt: string | null = null;

const routeFiles = [
	{
		file: 'routes/__root.tsx',
		label: 'app shell',
		detail: 'providers, error boundary, layout',
	},
	{
		file: 'routes/_app.tsx',
		label: 'layout route',
		detail: 'authenticated product frame',
	},
	{
		file: 'routes/_app.invoices.$id.tsx',
		label: 'typed params',
		detail: 'id, loader data, links',
	},
	{
		file: 'routes/_app.search.tsx',
		label: 'URL state',
		detail: 'validated filters and pagination',
	},
];

const heroProof = [
	{
		label: 'Typed route map',
		value: 'paths, params, links, navigate',
	},
	{
		label: 'URL state APIs',
		value: 'search schemas, parse, serialize',
	},
	{
		label: 'Data before render',
		value: 'loaders, cache, prefetch, pending UI',
	},
];

const routeContractCards = [
	{
		eyebrow: 'links',
		title: 'Navigation knows the route tree.',
		body: 'Link, redirect, and navigate calls autocomplete against generated paths, params, and search contracts instead of stringly-typed guesses.',
		icon: <LinkIcon size={18} />,
	},
	{
		eyebrow: 'search',
		title: 'Search params behave like state.',
		body: 'Parse, validate, inherit, update, and share URL state with the same confidence you expect from a state manager.',
		icon: <Search size={18} />,
	},
	{
		eyebrow: 'loaders',
		title: 'Data work starts at the route.',
		body: 'Route loaders run in parallel, preload on intent, cache results, and hand typed data to the component before render.',
		icon: <DatabaseZap size={18} />,
	},
	{
		eyebrow: 'boundaries',
		title: 'Every route owns its lifecycle.',
		body: 'Pending UI, errors, not-found states, code splitting, and context can live where the product route actually changes.',
		icon: <Boxes size={18} />,
	},
];

type RouterSearchPreset = {
	label: string;
	page: number;
	q: string;
	sort: 'stars' | 'recent';
	tags: Array<string>;
};

const searchExamples: Array<RouterSearchPreset> = [
	{
		label: 'Popular docs',
		page: 2,
		q: 'router',
		sort: 'stars',
		tags: ['react', 'solid'],
	},
	{
		label: 'Recent guides',
		page: 1,
		q: 'loader',
		sort: 'recent',
		tags: ['data'],
	},
	{
		label: 'Vue examples',
		page: 3,
		q: 'search',
		sort: 'stars',
		tags: ['vue', 'url-state'],
	},
];

const loaderSteps = [
	{
		label: 'match',
		body: 'The next route is known before the component renders.',
	},
	{
		label: 'preload',
		body: 'Hover, viewport, or intent can start route data early.',
	},
	{
		label: 'cache',
		body: 'Loaders reuse fresh results and avoid waterfalls by default.',
	},
	{
		label: 'render',
		body: 'Components receive typed loader data and pending state.',
	},
];

export default function RouterLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;

	return <div
		class="w-full min-w-0 overflow-x-hidden bg-[#f7fbf7] text-zinc-950 dark:bg-zinc-950 dark:text-white"
	>
		<section
			class="max-w-full overflow-hidden border-b border-emerald-950/10 bg-[#f3fbf5] dark:border-emerald-300/10 dark:bg-[#04100b]"
		>
			<div
				class="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.88fr_1.12fr] lg:items-start lg:py-12 xl:max-w-[92rem]"
			>
				<div class="min-w-0 max-w-full sm:max-w-3xl">
					<SectionKicker icon={<Route size={14} />}>Type-safe router</SectionKicker>

					<h1 class="mt-4 text-5xl font-black leading-[0.95] sm:text-6xl lg:text-7xl">
						<LibraryWordmark library={library} />
					</h1>

					<p
						class="mt-5 max-w-2xl text-lg font-bold leading-8 text-zinc-900 dark:text-zinc-100 sm:text-xl"
					>
						The route tree is the application contract.
					</p>

					<p class="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
						Router turns your routes into typed APIs for navigation, URL state, loaders, pending
						states, and code splitting. Keep the app client-first, then bring Start in when the same
						route tree needs a server.
					</p>

					<LibraryDownloadsMicro
						animateIncreaseTrend
						library={library}
						className="mt-5"
						label="weekly downloads"
						period="weekly"
						showTotals
					/>

					<p
						class="mt-4 max-w-xl border-l-2 border-emerald-500 pl-3 text-sm font-black text-emerald-800 dark:text-emerald-200"
					>
						The fastest-growing router in the JavaScript ecosystem.
					</p>

					<div class="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
						<RouterLink
							to="/$libraryId/$version/docs"
							params={{ libraryId: library.id, version: resolvedVersion }}
							label="Read the docs"
							icon={<BookOpen size={16} aria-hidden="true" />}
						/>
						<LandingCopyPromptButton getPrompt={getRouterAgentPrompt} label="Copy Router Prompt" />
					</div>

					<div class="mt-8 grid gap-3 sm:grid-cols-3">{heroProof.map(
						(proof) => <ProofPill key={proof.label} {...proof} />,
					)}</div>
					<LandingEcosystemProof />
				</div>

				<RouteMapPanel />
			</div>
		</section>

		<section
			class="border-b border-emerald-950/10 bg-[#ecf9ef] dark:border-emerald-300/10 dark:bg-[#06150d]"
		>
			<div
				class="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]"
			>
				<div class="max-w-xl">
					<SectionKicker icon={<Sparkles size={14} />}>Application builder</SectionKicker>
					<h2 class="mt-3 text-3xl font-black leading-tight sm:text-4xl">
						Start with a Router app, then add only what the product asks for.
					</h2>
					<p class="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
						Describe the app shape and the builder will bias toward Router: typed routes, search
						state, loaders, and a clean client-side foundation. When the brief needs full-stack
						work, it can point you toward Start instead of pretending every app is the same.
					</p>
				</div>

				<div class="min-w-0 max-w-full overflow-hidden">
					<ApplicationStarter
						context="router"
						forceRouterOnly
						mode="compact"
						primaryActionLabel="Copy Router Prompt"
						secondaryActionLabel="Build Router app on Netlify"
						title="Describe the app you want to route"
						tone="emerald"
					/>
				</div>
			</div>
		</section>

		<section class="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
			<div
				class="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.7fr_1.3fr] xl:max-w-[92rem]"
			>
				<div>
					<SectionKicker icon={<ListTree size={14} />}>Route contract</SectionKicker>
					<h2 class="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
						The file, the URL, and the component agree.
					</h2>
					<p class="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
						Router is not just a path matcher. It is a generated contract that ties route params,
						search schemas, loader data, context, links, and navigation to the same route tree.
					</p>
				</div>

				<div class="grid gap-4 md:grid-cols-2">{routeContractCards.map(
					(card) => <ContractCard key={card.title} {...card} />,
				)}</div>
			</div>
		</section>

		<section class="border-b border-zinc-200 bg-[#fbfaf6] dark:border-zinc-800 dark:bg-zinc-900">
			<div
				class="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[1.1fr_0.9fr] lg:items-center xl:max-w-[92rem]"
			>
				<SearchStatePanel />
				<div>
					<SectionKicker icon={<Search size={14} />}>URL state</SectionKicker>
					<h2 class="mt-3 text-3xl font-black leading-tight sm:text-4xl">
						Search params without the URLSearchParams ceremony.
					</h2>
					<p class="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
						Filters, tabs, pagination, sort order, and shareable UI state can live in the URL
						without becoming string parsing chores. Router gives search params schemas, validation,
						inheritance, structural sharing, and type-safe writes.
					</p>
				</div>
			</div>
		</section>

		<section class="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
			<div
				class="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.76fr_1.24fr] lg:items-start xl:max-w-[92rem]"
			>
				<div>
					<SectionKicker icon={<MousePointerClick size={14} />}>
						Loaders and preload
					</SectionKicker>
					<h2 class="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
						Navigation can start before the click lands.
					</h2>
					<p class="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
						Route loaders hoist async work out of components, run in parallel, cache results, and
						preload when the user shows intent. The route owns the data boundary, so pending and
						error UI stay close to the product surface.
					</p>
				</div>

				<LoaderPipeline />
			</div>
		</section>

		<section class="bg-white py-12 dark:bg-zinc-950">
			<div class="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
				<div class="max-w-3xl">
					<SectionKicker icon={<GithubIcon className="h-4 w-4" />}>
						Open source ecosystem
					</SectionKicker>
					<h2 class="mt-3 text-3xl font-black leading-tight sm:text-4xl">
						Router is the foundation many TanStack apps build on.
					</h2>
					<p class="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
						Router is built in public by the same community shaping Start, Query, and the rest of
						the stack. Maintainers, examples, partners, and sponsors stay part of the product story.
					</p>
				</div>
			</div>

			<div class="mt-10 flex flex-col gap-14">
				<LandingCommunitySection libraryId="router" />
				<SponsorSection title="GitHub Sponsors" aspectRatio="1/1" packMaxWidth="900px" showCTA />
			</div>
		</section>

		<BottomCTA
			linkProps={{
				to: '/$libraryId/$version/docs',
				params: { libraryId: library.id, version: resolvedVersion },
			}}
			label="Get Started!"
			className="border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"
		/>
		<Footer />
	</div>;
}

function RouteMapPanel() {
	return <div
		class="min-w-0 w-full max-w-full overflow-hidden rounded-lg border border-emerald-200 bg-white p-4 shadow-sm shadow-emerald-950/5 dark:border-emerald-900 dark:bg-zinc-950"
	>
		<div class="flex items-center justify-between gap-3">
			<div class="flex items-center gap-2">
				<span class="h-2.5 w-2.5 rounded-md bg-red-400" />
				<span class="h-2.5 w-2.5 rounded-md bg-yellow-400" />
				<span class="h-2.5 w-2.5 rounded-md bg-emerald-400" />
			</div>
			<span class="text-xs font-bold text-zinc-500 dark:text-zinc-400">
				generated route map
			</span>
		</div>

		<div class="mt-4 grid gap-3 lg:grid-cols-[1.08fr_0.92fr]">
			<div class="space-y-2">{routeFiles.map(
				(routeFile, index) => <div
					key={routeFile.file}
					class="grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<span
						class="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-100 font-mono text-sm font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
					>
						{index + 1}
					</span>
					<div class="min-w-0">
						<p
							class="truncate font-mono text-sm font-black text-zinc-950 dark:text-white"
						>{routeFile.file as string}</p>
						<p class="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
							<span
								class="font-bold text-zinc-800 dark:text-zinc-200"
							>{routeFile.label as string}</span>
							{' '}
							{routeFile.detail as string}
						</p>
					</div>
				</div>,
			)}</div>

			<div
				class="grid content-between gap-3 rounded-lg bg-emerald-50 p-4 text-emerald-950 dark:bg-emerald-950/35 dark:text-emerald-100"
			>
				<div>
					<p class="text-sm font-black">RouteTree.gen.ts</p>
					<p class="mt-2 text-xs leading-5 text-emerald-950/75 dark:text-emerald-100/75">
						A generated map keeps the route files, params, search schemas, and loader outputs
						connected to the APIs you call every day.
					</p>
				</div>

				<div class="grid gap-2 text-xs font-bold">{[
					'<Link to="/invoices/$id" />',
					'navigate({ search })',
					'useLoaderData()',
					'validateSearch()',
				].map(
					(item) =>
						<div
							key={item}
							class="rounded-md bg-white/80 px-3 py-2 font-mono dark:bg-zinc-950/70"
						>{item as string}</div>,
				)}</div>
			</div>
		</div>
	</div>;
}

function SearchStatePanel() {
	const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
	const selectedPreset = searchExamples[selectedPresetIndex] ?? searchExamples[0];
	const searchParamDisplay = buildSearchParamDisplay(selectedPreset);

	return <div
		class="min-w-0 rounded-lg border border-emerald-200 bg-white p-4 dark:border-emerald-900 dark:bg-zinc-950"
	>
		<div class="flex items-start justify-between gap-4">
			<p
				class="min-w-0 break-all font-mono text-sm font-black leading-6 text-zinc-950 dark:text-white"
			>
				/docs
				<span class="text-emerald-600 dark:text-emerald-300">{searchParamDisplay.replace(
					'/docs',
					'',
				) as string}</span>
			</p>
			<span
				class="rounded-md bg-emerald-100 px-2 py-1 text-xs font-black uppercase text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
			>
				validated
			</span>
		</div>

		<div class="mt-4 flex flex-wrap gap-2">{searchExamples.map(
			(preset, index) => <button
				key={preset.label}
				aria-pressed={selectedPresetIndex === index}
				class={selectedPresetIndex === index
					? 'rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-2 text-left text-white'
					: 'rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/25'}
				type="button"
				onClick={() => setSelectedPresetIndex(index)}
			>
				<p
					class={selectedPresetIndex === index
						? 'text-[0.65rem] font-black uppercase text-white/75'
						: 'text-[0.65rem] font-black uppercase text-zinc-500 dark:text-zinc-400'}
				>{preset.label as string}</p>
				<p
					class={selectedPresetIndex === index
						? 'mt-1 font-mono text-sm font-bold text-white'
						: 'mt-1 font-mono text-sm font-bold text-zinc-950 dark:text-white'}
				>
					=
					{preset.q as string}
				</p>
			</button>,
		)}</div>

		<div class="mt-3 grid gap-2 sm:grid-cols-4">{[
			['sort', selectedPreset.sort],
			['page', `${selectedPreset.page}`],
			['tags', selectedPreset.tags.join(',')],
			['matched', `${selectedPreset.tags.length + selectedPreset.page}`],
		].map(
			([key, value]) => <div
				key={key}
				class="rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/25"
			>
				<p
					class="text-[0.65rem] font-black uppercase text-emerald-800 dark:text-emerald-300"
				>{key as string}</p>
				<p
					class="mt-1 truncate font-mono text-sm font-bold text-emerald-950 dark:text-emerald-100"
				>{value as string}</p>
			</div>,
		)}</div>

		<div class="mt-4 rounded-lg bg-zinc-950 p-4 text-sm text-emerald-100 dark:bg-black">
			<p class="font-mono leading-6">
				<span class="text-emerald-300">validateSearch</span>
				: z.object(
				{'{'}
				<br />
				&nbsp;&nbsp;q: z.string().optional(),
				<br />
				&nbsp;&nbsp;page: z.number().catch(1),
				<br />
				&nbsp;&nbsp;sort: z.enum(['stars', 'recent']),
				<br />
				&nbsp;&nbsp;tags: z.array(z.string()).catch([])
				<br />
				{'}'}
				)
			</p>
		</div>
	</div>;
}

function buildSearchParamDisplay(preset: RouterSearchPreset) {
	const params = new URLSearchParams({
		page: `${preset.page}`,
		q: preset.q,
		sort: preset.sort,
		tags: preset.tags.join(','),
	});

	return `/docs?${params.toString()}`;
}

function LoaderPipeline() {
	return <div class="grid gap-3 md:grid-cols-4">{loaderSteps.map(
		(step, index) => <div
			key={step.label}
			class="relative rounded-lg border border-zinc-200 bg-[#fbfaf7] p-4 dark:border-zinc-800 dark:bg-zinc-900"
		>
			<span
				class="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-sm font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
			>
				{index + 1}
			</span>
			<h3 class="mt-4 text-lg font-black capitalize leading-tight">{step.label as string}</h3>
			<p class="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{step.body as string}</p>
		</div>,
	)}</div>;
}

function ContractCard({
	body,
	eyebrow,
	icon,
	title,
}: {
	body: string;
	eyebrow: string;
	icon: any;
	title: string;
}) {
	return <div
		class="rounded-lg border border-zinc-200 bg-[#fbfaf7] p-5 dark:border-zinc-800 dark:bg-zinc-900"
	>
		<div class="flex items-start justify-between gap-4">
			<span
				class="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
			>{icon}</span>
			<span
				class="rounded-md bg-zinc-100 px-2 py-1 text-[0.65rem] font-black uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
			>{eyebrow as string}</span>
		</div>
		<h3 class="mt-4 text-xl font-black leading-tight">{title as string}</h3>
		<p class="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body as string}</p>
	</div>;
}

function SectionKicker({ children, icon }: { children: any; icon: any }) {
	return <p
		class="inline-flex items-center gap-2 text-sm font-black uppercase text-emerald-700 dark:text-emerald-300"
	>
		{icon}
		{children}
	</p>;
}

function ProofPill({ label, value }: { label: string; value: string }) {
	return <div class="border-l-2 border-emerald-500 pl-3">
		<p class="text-sm font-black text-zinc-950 dark:text-white">{label as string}</p>
		<p class="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value as string}</p>
	</div>;
}

function RouterLink({
	icon,
	label,
	params,
	to,
}: {
	icon: any;
	label: string;
	params: Record<string, string>;
	to: string;
}) {
	return <Link
		to={to}
		params={params}
		className="inline-flex w-full max-w-full items-center justify-center gap-2 rounded-lg border border-zinc-950 bg-zinc-950 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 sm:w-auto"
	>
		{icon}
		{label as string}
		<ArrowRight size={15} aria-hidden="true" />
	</Link>;
}

function getRouterBlankStarterInput() {
	const blankStarter = getApplicationStarterSuggestions('router').find(
		(suggestion) => suggestion.label === 'Blank starter',
	);

	return blankStarter?.input ??
		'Create a blank TanStack Router app with no extra integrations or feature scaffolding.';
}

async function getRouterAgentPrompt() {
	if (cachedRouterAgentPrompt) {
		return cachedRouterAgentPrompt;
	}

	const result = await resolveApplicationStarterDeterministically({
		context: 'router',
		input: routerBlankStarterInput,
	});

	cachedRouterAgentPrompt = result.prompt;
	return cachedRouterAgentPrompt;
}
