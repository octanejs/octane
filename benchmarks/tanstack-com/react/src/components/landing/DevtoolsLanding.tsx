import * as React from 'react';
import { Link, useParams } from '@tanstack/react-router';
import {
	ArrowRight,
	BookOpen,
	Dock,
	Eye,
	Gauge,
	Layers,
	PanelRight,
	Plug,
	Puzzle,
	ScanSearch,
	Sparkles,
	Workflow,
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
const library = getLibrary('devtools');
const devtoolsAgentPrompt = [
	'Add TanStack Devtools to a TypeScript app.',
	'Use the unified devtools shell to host TanStack panels and any custom product devtools, keeping the panel lightweight, framework-friendly, and available during development without coupling product code to one library-specific inspector.',
	'Include examples for mounting built-in panels and product-specific panels through the plugins array.',
].join(' ');

const heroProof = [
	{
		label: 'One shell',
		value: 'Query, Router, custom panels',
	},
	{
		label: 'Bring panels',
		value: 'library devtools or product-specific tools',
	},
	{
		label: 'Framework friendly',
		value: 'React, Vue, Solid, Preact, Angular',
	},
];

const panels = [
	{
		title: 'Query',
		body: 'cache, observers, mutations, stale state',
	},
	{
		title: 'Router',
		body: 'matches, loaders, params, pending state',
	},
	{
		title: 'Custom',
		body: 'feature flags, jobs, queues, product state',
	},
];

const featureCards = [
	{
		title: 'A shared place for runtime truth.',
		body: 'TanStack apps already have rich runtime state. Devtools gives that state a consistent panel instead of scattering inspectors across the UI.',
		icon: <ScanSearch size={18} />,
	},
	{
		title: 'Custom panels belong next to library panels.',
		body: 'Register product-specific devtools beside Query and Router so teams can inspect the state that matters for their own workflow.',
		icon: <Puzzle size={18} />,
	},
	{
		title: 'The shell stays light.',
		body: 'The devtools UI is built to be mounted in development without turning each TanStack package into its own windowing system.',
		icon: <Gauge size={18} />,
	},
	{
		title: 'Frameworks get adapters, not rewrites.',
		body: 'Use the shell from React, Vue, Solid, Preact, Angular, or vanilla integration points while panels keep their own internal state model.',
		icon: <Layers size={18} />,
	},
];

const panelLifecycle = [
	{
		label: 'Mount',
		body: 'Add the devtools shell once near the app root.',
	},
	{
		label: 'Register',
		body: 'Provide TanStack panels or custom panels through the plugins array.',
	},
	{
		label: 'Inspect',
		body: 'Read cache, route, queue, feature, or product state while the app is live.',
	},
	{
		label: 'Share',
		body: 'Keep product-specific debugging tools in the same workflow as the core libraries.',
	},
];

const frameworkAdapters = ['React', 'Vue', 'Solid', 'Preact', 'Angular', 'Vanilla'];

export default function DevtoolsLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;

	return (
		<div className="w-full min-w-0 overflow-x-hidden bg-zinc-100 text-zinc-950 dark:bg-zinc-950 dark:text-white">
			<section className="max-w-full overflow-hidden border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.84fr_1.16fr] lg:items-start lg:py-12 xl:max-w-[92rem]">
					<div className="min-w-0 max-w-full sm:max-w-3xl">
						<SectionKicker icon={<Dock size={14} />}>Unified devtools shell</SectionKicker>

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
							One panel for the state your app is built on.
						</p>

						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Devtools brings TanStack inspectors and your own custom panels into one development
							surface, so the cache, routes, mutations, queues, flags, and product-specific state
							can be explored while the app is running.
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
							<DevtoolsLink
								to="/$libraryId/$version/docs"
								params={{ libraryId: library.id, version: resolvedVersion }}
								label="Read the docs"
								icon={<BookOpen size={16} aria-hidden="true" />}
							/>
							<LandingCopyPromptButton prompt={devtoolsAgentPrompt} label="Copy Devtools Prompt" />
						</div>

						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							{heroProof.map((proof) => (
								<ProofPill key={proof.label} {...proof} />
							))}
						</div>
					</div>

					<DevtoolsPanel />
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.74fr_1.26fr] xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Sparkles size={14} />}>Why Devtools</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Every serious app grows its own debugging surface.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Instead of inventing floating panels per library or hiding debug screens behind
							product routes, Devtools gives teams a shared shell for runtime introspection.
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
						<SectionKicker icon={<Workflow size={14} />}>Panel workflow</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Mount the shell once. Let panels bring the detail.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Devtools should feel like infrastructure: present when you need it, quiet when you do
							not, and flexible enough for the next TanStack library or product-specific inspector.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fbfaf6] dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.82fr_1.18fr] lg:items-start xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Plug size={14} />}>Custom panels</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							The product can have devtools too.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Add panels for feature flags, sync jobs, queues, local storage, generated clients,
							background tasks, or anything your team needs to inspect without shipping another
							admin route.
						</p>
					</div>

					<CustomPanelExample />
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<PanelRight size={14} />}>Framework adapters</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							A shared shell across app runtimes.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Use Devtools where your app lives, then host panels that speak the state model of each
							TanStack library or your product code.
						</p>
						<div className="mt-5 flex flex-wrap gap-2">
							{frameworkAdapters.map((framework) => (
								<span
									key={framework}
									className="rounded-md border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-sm font-bold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
								>
									{framework}
								</span>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-zinc-100 py-12 dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
					<div className="max-w-3xl">
						<SectionKicker icon={<Eye size={14} />}>Field notes</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							A good devtool makes invisible state negotiable.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							The point is not another chrome wrapper. It is giving teams a reliable place to see,
							question, and debug the runtime state their app depends on.
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
							Devtools connects the work happening across the stack.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Maintainers, panel authors, examples, partners, and GitHub sponsors keep the shell
							useful as TanStack libraries keep growing.
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col gap-14">
					<LandingCommunitySection libraryId="devtools" />
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
				className="border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
			/>
			<Footer />
		</div>
	);
}

function DevtoolsPanel() {
	const [activePanelIndex, setActivePanelIndex] = React.useState(0);
	const activePanel = panels[activePanelIndex] ?? panels[0];
	const panelStats =
		activePanel.title === 'Query'
			? [
					['queries', '42'],
					['mutations', '3'],
					['stale', '8'],
				]
			: activePanel.title === 'Router'
				? [
						['matches', '6'],
						['loaders', '4'],
						['pending', '1'],
					]
				: [
						['jobs', '12'],
						['flags', '9'],
						['queues', '2'],
					];

	return (
		<div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-zinc-300 bg-zinc-950 p-4 text-white shadow-sm shadow-zinc-950/10 dark:border-zinc-800">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				</div>
				<span className="text-xs font-bold text-zinc-400">unified shell</span>
			</div>

			<div className="mt-4 grid gap-3 lg:grid-cols-[0.45fr_1fr]">
				<div className="space-y-2">
					{panels.map((panel, index) => (
						<button
							key={panel.title}
							className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
								index === activePanelIndex
									? 'border-white bg-white text-zinc-950'
									: 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-zinc-600'
							}`}
							type="button"
							onClick={() => setActivePanelIndex(index)}
						>
							<p className="text-sm font-black">{panel.title}</p>
						</button>
					))}
				</div>

				<div className="rounded-lg border border-zinc-800 bg-black p-4">
					<div className="grid gap-3 sm:grid-cols-3">
						{panelStats.map(([label, value]) => (
							<div key={label} className="rounded-lg bg-zinc-900 p-3">
								<p className="text-[0.65rem] font-black uppercase text-zinc-500">{label}</p>
								<p className="mt-1 text-lg font-black">{value}</p>
							</div>
						))}
					</div>
					<div className="mt-4 space-y-2">
						{[activePanel, ...panels.filter((panel) => panel !== activePanel)].map((panel) => (
							<div
								key={panel.body}
								className={
									panel === activePanel
										? 'rounded-lg border border-white/30 bg-zinc-900 p-3'
										: 'rounded-lg border border-zinc-800 bg-zinc-950 p-3'
								}
							>
								<p className="text-xs font-black uppercase text-zinc-500">{panel.title}</p>
								<p className="mt-1 text-sm text-zinc-300">{panel.body}</p>
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
			{panelLifecycle.map((step, index) => (
				<div
					key={step.label}
					className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-sm font-black text-white dark:bg-white dark:text-zinc-950">
						{index + 1}
					</span>
					<h3 className="mt-4 text-lg font-black leading-tight">{step.label}</h3>
					<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{step.body}</p>
				</div>
			))}
		</div>
	);
}

function CustomPanelExample() {
	return (
		<div className="min-w-0 rounded-lg border border-zinc-300 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
			<div className="rounded-lg bg-zinc-950 p-4 text-sm text-zinc-100 dark:bg-black">
				<p className="font-mono leading-6">
					&lt;TanStackDevtools
					<br />
					&nbsp;&nbsp;plugins={'{'}[{'{'}
					<br />
					&nbsp;&nbsp;&nbsp;&nbsp;name: &quot;Background Jobs&quot;,
					<br />
					&nbsp;&nbsp;&nbsp;&nbsp;render: &lt;JobsPanel /&gt;,
					<br />
					&nbsp;&nbsp;{'}'}]{'}'}
					<br />
					/&gt;
				</p>
			</div>

			<div className="mt-4 grid gap-3 md:grid-cols-2">
				{[
					['feature flags', 'which flags are active and why'],
					['sync jobs', 'pending, failed, retrying, complete'],
					['queues', 'active tasks, concurrency, next flush'],
					['generated clients', 'requests, schemas, cache entries'],
				].map(([label, body]) => (
					<div
						key={label}
						className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
					>
						<p className="text-sm font-black">{label}</p>
						<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
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
			<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
				{icon}
			</span>
			<h3 className="mt-4 text-xl font-black leading-tight">{title}</h3>
			<p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
		</div>
	);
}

function SectionKicker({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
	return (
		<p className="inline-flex items-center gap-2 text-sm font-black uppercase text-zinc-700 dark:text-zinc-300">
			{icon}
			{children}
		</p>
	);
}

function ProofPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-l-2 border-zinc-950 pl-3 dark:border-white">
			<p className="text-sm font-black text-zinc-950 dark:text-white">{label}</p>
			<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value}</p>
		</div>
	);
}

function DevtoolsLink({
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
