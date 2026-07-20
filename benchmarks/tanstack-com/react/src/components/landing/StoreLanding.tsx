import * as React from 'react';
import { Link, useParams } from '@tanstack/react-router';
import {
	ArrowRight,
	BookOpen,
	Cpu,
	Fingerprint,
	Layers,
	Radio,
	RefreshCcw,
	ScanLine,
	Sparkles,
	Split,
	WandSparkles,
} from 'lucide-react';

import { BottomCTA } from '~/components/BottomCTA';
import { Footer } from '~/components/Footer';
import { GithubIcon } from '~/components/icons/GithubIcon';
import { LandingCommunitySection } from '~/components/LandingCommunitySection';
import { SponsorSection } from '~/components/SponsorSection';
import { LibraryDownloadsMicro } from '~/components/LibraryDownloadsMicro';
import { LibraryWordmark } from '~/components/LibraryWordmark';
import LandingPageGad from '~/components/LandingPageGad';
import { getLibrary } from '~/libraries';

import { LandingCopyPromptButton } from '~/components/landing/LandingCopyPromptButton';
const library = getLibrary('store');
const storeAgentPrompt = [
	'Build a TanStack Store state model for a TypeScript app.',
	'Use immutable updates, derived values, scoped subscriptions, and framework adapters so components subscribe only to the state slices they need.',
	'Keep the store small and framework-agnostic, and show how it can power UI state, library internals, or adapters without replacing server-state tools like TanStack Query or DB.',
].join(' ');

const heroProof = [
	{
		label: 'Immutable core',
		value: 'predictable updates and snapshots',
	},
	{
		label: 'Reactive selectors',
		value: 'subscribe to the slice that matters',
	},
	{
		label: 'Adapter friendly',
		value: 'React, Vue, Solid, Svelte, Angular, Lit',
	},
];

const featureCards = [
	{
		title: 'Small enough to sit under other libraries.',
		body: 'Store is the tiny reactive primitive that powers parts of the TanStack ecosystem, including framework adapters and library internals.',
		icon: <Cpu size={18} />,
	},
	{
		title: 'Immutable updates keep changes legible.',
		body: 'State transitions are explicit, snapshots are predictable, and derived values can be reasoned about without mutating shared objects in place.',
		icon: <Fingerprint size={18} />,
	},
	{
		title: 'Subscriptions stay narrow.',
		body: 'Components can listen to exactly the state they render, so a busy product surface does not need to repaint just because nearby state changed.',
		icon: <Radio size={18} />,
	},
	{
		title: 'Framework adapters are a layer, not the store.',
		body: 'Use the adapter for your renderer while the core store stays portable across apps, packages, and UI runtimes.',
		icon: <Layers size={18} />,
	},
];

const lifecycleSteps = [
	{
		label: 'Write',
		body: 'An action updates store state through a predictable immutable transition.',
	},
	{
		label: 'Derive',
		body: 'Computed values can depend on the store without becoming another hand-synced state bucket.',
	},
	{
		label: 'Select',
		body: 'Subscribers choose the exact slice they need for rendering or effects.',
	},
	{
		label: 'Adapt',
		body: 'Framework adapters bridge the same store into React, Vue, Solid, Svelte, Angular, Lit, or vanilla code.',
	},
];

const subscriptionExamples = [
	{
		label: 'component',
		value: 'useSelector(appStore, state => state.filters)',
	},
	{
		label: 'derived',
		value: 'visibleCount = selectedIds.length',
	},
	{
		label: 'effect',
		value: 'store.subscribe(listener)',
	},
	{
		label: 'adapter',
		value: 'same core, renderer-specific bindings',
	},
];

const frameworkAdapters = ['React', 'Preact', 'Solid', 'Svelte', 'Vue', 'Angular', 'Lit'];

export default function StoreLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;

	return (
		<div className="w-full min-w-0 overflow-x-hidden bg-[#f8f5ee] text-zinc-950 dark:bg-zinc-950 dark:text-white">
			<section className="max-w-full overflow-hidden border-b border-twine-950/10 bg-[#eee6d3] dark:border-twine-300/10 dark:bg-[#160d09]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.84fr_1.16fr] lg:items-start lg:py-12 xl:max-w-[92rem]">
					<div className="min-w-0 max-w-full sm:max-w-3xl">
						<SectionKicker icon={<WandSparkles size={14} />}>
							Immutable reactive store
						</SectionKicker>

						<div className="mt-4 flex flex-wrap items-start gap-x-3 gap-y-2">
							<h1 className="text-5xl font-black leading-[0.95] sm:text-6xl lg:text-7xl">
								<LibraryWordmark library={library} />
							</h1>
							{library.badge ? (
								<span className="rounded-md bg-zinc-950 px-2 py-1 text-xs font-black uppercase text-white dark:bg-white dark:text-zinc-950">
									{library.badge}
								</span>
							) : null}
						</div>

						<p className="mt-5 max-w-2xl text-lg font-bold leading-8 text-zinc-900 dark:text-zinc-100 sm:text-xl">
							The tiny reactive core behind serious state.
						</p>

						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Store is a framework-agnostic state primitive for immutable updates, derived values,
							and targeted subscriptions. It is small enough for library internals and flexible
							enough for product UI state that should stay reactive without becoming server state.
						</p>

						<LibraryDownloadsMicro
							animateIncreaseTrend
							library={library}
							className="mt-5"
							label="weekly downloads"
							period="weekly"
							showTotals
						/>

						<div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
							<StoreLink
								to="/$libraryId/$version/docs"
								params={{ libraryId: library.id, version: resolvedVersion }}
								label="Read the docs"
								icon={<BookOpen size={16} aria-hidden="true" />}
							/>
							<LandingCopyPromptButton prompt={storeAgentPrompt} label="Copy Store Prompt" />
						</div>

						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							{heroProof.map((proof) => (
								<ProofPill key={proof.label} {...proof} />
							))}
						</div>
					</div>

					<StorePanel />
				</div>
			</section>

			<section className="border-b border-twine-950/10 bg-[#f8f5ee] dark:border-twine-300/10 dark:bg-[#1b100b]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.74fr_1.26fr] xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Sparkles size={14} />}>Why Store</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Some state should be local, reactive, and boring.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Store is not trying to be your server cache, database, or router. It is the small
							state primitive you reach for when client state needs predictable updates, granular
							subscriptions, and adapters without a framework-specific runtime.
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
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[1.05fr_0.95fr] lg:items-center xl:max-w-[92rem]">
					<LifecyclePanel />
					<div>
						<SectionKicker icon={<RefreshCcw size={14} />}>Store lifecycle</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Write once, derive once, subscribe precisely.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							A good store keeps state transitions visible and component subscriptions narrow. Store
							gives you the primitives without forcing a global architecture on the whole app.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fbfaf6] dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.82fr_1.18fr] lg:items-start xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<ScanLine size={14} />}>Subscriptions</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Let the component ask for less.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Filters, editor drafts, selected rows, hover state, panel layout, and derived labels
							all change at different speeds. Store lets each UI surface subscribe to its own slice.
						</p>
					</div>

					<SubscriptionPanel />
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<Split size={14} />}>Framework adapters</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							One store core, renderer-specific bindings.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							The store can live below React, Preact, Solid, Svelte, Vue, Angular, Lit, or vanilla
							TypeScript. The adapter connects it to the renderer without changing the state model.
						</p>
						<div className="mt-5 flex flex-wrap gap-2">
							{frameworkAdapters.map((framework) => (
								<span
									key={framework}
									className="rounded-md border border-twine-200 bg-twine-50 px-3 py-1.5 text-sm font-bold text-twine-800 dark:border-twine-900 dark:bg-twine-950/40 dark:text-twine-200"
								>
									{framework}
								</span>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#f8f5ee] py-12 dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
					<div className="max-w-3xl">
						<SectionKicker icon={<Cpu size={14} />}>Field notes</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							The quiet primitive behind louder libraries.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Store matters because it disappears. It gives TanStack libraries a shared reactive
							substrate while staying small enough for your own client state.
						</p>
					</div>
				</div>
			</section>

			<section className="bg-white py-12 dark:bg-zinc-950">
				<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
					<div className="max-w-3xl">
						<SectionKicker icon={<GithubIcon className="h-4 w-4" />}>
							Open source ecosystem
						</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Store is maintained close to the libraries that rely on it.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Maintainers, framework adapters, examples, partners, and GitHub sponsors keep the
							primitive honest because it has to serve real TanStack packages.
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col gap-14">
					<LandingCommunitySection libraryId="store" />
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
				className="border-twine-700 bg-twine-700 text-white hover:bg-twine-800"
			/>
			<Footer />
		</div>
	);
}

function StorePanel() {
	const [theme, setTheme] = React.useState<'light' | 'dark'>('light');
	const [density, setDensity] = React.useState<'comfortable' | 'compact'>('comfortable');
	const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
	const previewRows =
		density === 'compact'
			? ['Routes', 'Queries', 'Tables', 'Forms']
			: ['Routes', 'Queries', 'Tables'];
	const storeRows = [
		['theme', theme],
		['sidebar', isSidebarOpen ? 'open' : 'closed'],
		['density', density],
	];

	return (
		<div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-twine-200 bg-white p-4 shadow-sm shadow-twine-950/5 dark:border-twine-900 dark:bg-zinc-950">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				</div>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">settings store</span>
			</div>

			<div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
				<div className="space-y-3">
					{storeRows.map(([key, value]) => (
						<div
							key={key}
							className="rounded-lg border border-zinc-200 bg-twine-50 p-3 dark:border-zinc-800 dark:bg-twine-950/20"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="truncate font-mono text-sm font-black">ui.{key}</p>
									<p className="mt-1 text-xs font-bold text-zinc-500 dark:text-zinc-400">
										subscribed slice
									</p>
								</div>
								<span className="rounded-md bg-twine-100 px-2 py-1 text-[0.65rem] font-black uppercase text-twine-800 dark:bg-twine-950 dark:text-twine-200">
									{value}
								</span>
							</div>
						</div>
					))}
				</div>

				<div className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
					<p className="font-mono text-sm font-black">uiStore.setState()</p>
					<div className="mt-4 grid gap-2 sm:grid-cols-2">
						<button
							className={
								theme === 'dark'
									? 'rounded-md border border-twine-700 bg-twine-700 px-3 py-2 text-sm font-black text-white'
									: 'rounded-md border border-twine-200 bg-white px-3 py-2 text-sm font-black text-twine-800 transition-colors hover:border-twine-400 dark:border-twine-900 dark:bg-zinc-950 dark:text-twine-200'
							}
							type="button"
							onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
						>
							Toggle theme
						</button>
						<button
							className="rounded-md border border-twine-200 bg-white px-3 py-2 text-sm font-black text-twine-800 transition-colors hover:border-twine-400 dark:border-twine-900 dark:bg-zinc-950 dark:text-twine-200"
							type="button"
							onClick={() =>
								setDensity((current) => (current === 'comfortable' ? 'compact' : 'comfortable'))
							}
						>
							Toggle density
						</button>
						<button
							className="rounded-md border border-twine-200 bg-white px-3 py-2 text-sm font-black text-twine-800 transition-colors hover:border-twine-400 dark:border-twine-900 dark:bg-zinc-950 dark:text-twine-200 sm:col-span-2"
							type="button"
							onClick={() => setIsSidebarOpen((current) => !current)}
						>
							{isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
						</button>
					</div>

					<div
						className={
							theme === 'dark'
								? 'mt-4 rounded-lg bg-zinc-950 p-3 text-white'
								: 'mt-4 rounded-lg bg-white p-3 text-zinc-950'
						}
					>
						<div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-2 text-sm dark:border-zinc-800">
							<span className="font-black">Preview</span>
							<span className="rounded-md bg-twine-100 px-2 py-1 text-[0.65rem] font-black uppercase text-twine-800">
								{theme}
							</span>
						</div>
						<div
							className={
								isSidebarOpen ? 'mt-3 grid gap-3 sm:grid-cols-[0.42fr_1fr]' : 'mt-3 grid gap-3'
							}
						>
							{isSidebarOpen ? (
								<div className="rounded-md bg-twine-100 p-2 text-xs font-black text-twine-900">
									Docs
									<br />
									Examples
									<br />
									API
								</div>
							) : null}
							<div className="space-y-2">
								{previewRows.map((row) => (
									<div
										key={row}
										className={
											density === 'compact'
												? 'rounded-md border border-zinc-200 px-2 py-1 text-xs font-bold dark:border-zinc-800'
												: 'rounded-md border border-zinc-200 px-3 py-2 text-sm font-bold dark:border-zinc-800'
										}
									>
										{row}
									</div>
								))}
							</div>
						</div>
					</div>

					<div className="mt-4 space-y-2">
						{[
							['Header', 'theme'],
							['Sidebar', 'sidebar'],
							['List rows', 'density'],
						].map(([label, value]) => (
							<div
								key={label}
								className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm dark:bg-zinc-950"
							>
								<span className="font-black">{label}</span>
								<span className="text-right text-zinc-600 dark:text-zinc-400">
									subscribes to ui.{value}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function LifecyclePanel() {
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{lifecycleSteps.map((step, index) => (
				<div
					key={step.label}
					className="rounded-lg border border-zinc-200 bg-[#f8f5ee] p-4 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-twine-100 text-sm font-black text-twine-800 dark:bg-twine-950 dark:text-twine-200">
						{index + 1}
					</span>
					<h3 className="mt-4 text-lg font-black leading-tight">{step.label}</h3>
					<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{step.body}</p>
				</div>
			))}
		</div>
	);
}

function SubscriptionPanel() {
	return (
		<div className="min-w-0 rounded-lg border border-twine-200 bg-white p-4 dark:border-twine-900 dark:bg-zinc-950">
			<div className="rounded-lg bg-zinc-950 p-4 text-sm text-twine-100 dark:bg-black">
				<p className="font-mono leading-6">
					const filters = useSelector(store, state =&gt; state.filters)
					<br />
					const canSave = useSelector(store, state =&gt; state.draft.isDirty)
				</p>
			</div>

			<div className="mt-4 grid gap-3 md:grid-cols-2">
				{subscriptionExamples.map((item) => (
					<div
						key={item.label}
						className="rounded-lg border border-zinc-200 bg-[#f8f5ee] p-4 dark:border-zinc-800 dark:bg-zinc-900"
					>
						<p className="text-[0.65rem] font-black uppercase text-zinc-500 dark:text-zinc-400">
							{item.label}
						</p>
						<p className="mt-2 break-words font-mono text-sm font-black leading-6 text-zinc-950 dark:text-white">
							{item.value}
						</p>
					</div>
				))}
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
			<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-twine-100 text-twine-800 dark:bg-twine-950 dark:text-twine-200">
				{icon}
			</span>
			<h3 className="mt-4 text-xl font-black leading-tight">{title}</h3>
			<p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
		</div>
	);
}

function SectionKicker({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
	return (
		<p className="inline-flex items-center gap-2 text-sm font-black uppercase text-twine-700 dark:text-twine-300">
			{icon}
			{children}
		</p>
	);
}

function ProofPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-l-2 border-twine-500 pl-3">
			<p className="text-sm font-black text-zinc-950 dark:text-white">{label}</p>
			<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value}</p>
		</div>
	);
}

function StoreLink({
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
