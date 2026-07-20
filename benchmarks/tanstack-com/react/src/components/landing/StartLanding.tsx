import * as React from 'react';
import { Link, useParams } from '@tanstack/react-router';
import {
	ArrowRight,
	BookOpen,
	CheckCircle2,
	ExternalLink,
	GitBranch,
	Layers,
	Network,
	Rocket,
	Server,
	Sparkles,
} from 'lucide-react';

import { BottomCTA } from '~/components/BottomCTA';
import { ApplicationStarter } from '~/components/ApplicationStarter';
import { Footer } from '~/components/Footer';
import { GithubIcon } from '~/components/icons/GithubIcon';
import { LandingCommunitySection } from '~/components/LandingCommunitySection';
import { SponsorSection } from '~/components/SponsorSection';
import { LibraryDownloadsMicro } from '~/components/LibraryDownloadsMicro';
import { LibraryWordmark } from '~/components/LibraryWordmark';
import { getLibrary } from '~/libraries';
import {
	getApplicationStarterSuggestions,
	resolveApplicationStarterDeterministically,
} from '~/utils/application-starter';

import { LandingEcosystemProof } from '~/components/landing/LandingEcosystemProof';
import { LandingCopyPromptButton } from '~/components/landing/LandingCopyPromptButton';
const library = getLibrary('start');
const startBlankStarterInput = getStartBlankStarterInput();

let cachedStartAgentPrompt: string | null = null;

const featureCards = [
	{
		title: 'Built on TanStack Router',
		body: 'Routes, params, search schemas, loaders, pending states, links, and navigation all come from TanStack Router. Start adds the server and deployment layer around that app model.',
		icon: <Network size={18} />,
	},
	{
		title: 'URL state is first-class',
		body: 'Search params are parsed, validated, inherited, and written through Router APIs, so filters, tabs, pagination, and deep app state can be shared instead of synchronized by hand.',
		icon: <GitBranch size={18} />,
	},
	{
		title: 'Server work stays explicit',
		body: 'createServerFn gives loaders, components, hooks, and handlers access to server-only work with validation, serializable boundaries, and same-origin RPC semantics.',
		icon: <Server size={18} />,
	},
	{
		title: 'SSR keeps the app model',
		body: 'Start can render the full document, stream useful UI, or opt routes into SPA/selective SSR modes while preserving the interactive client-side Router experience.',
		icon: <Layers size={18} />,
	},
];

const startRuntimeSteps = [
	{
		label: 'Match route',
		file: 'routes/_app.projects.$id.tsx',
		body: 'Router narrows params, search, context, loader deps, and links before React starts rendering.',
	},
	{
		label: 'Run loader',
		file: 'loader({ context, params })',
		body: 'Start can do the preload on the server, dehydrate Query, and reuse the same contract during client navigation.',
	},
	{
		label: 'Call server function',
		file: 'createServerFn({ method: "GET" })',
		body: 'Database, auth, and environment work stay behind an explicit, validated server boundary.',
	},
	{
		label: 'Stream document',
		file: 'SSR + route data + pending UI',
		body: 'The HTML shell, head tags, loader data, and useful pending states can leave as one streaming response.',
	},
	{
		label: 'Ship runtime output',
		file: 'runtime adapter for the host',
		body: 'The same app model builds for the deployment target instead of changing how routes are authored.',
	},
];

const startRuntimeOutputs = [
	{
		label: 'Route contract',
		value: 'params.id, search.tab, loaderData',
	},
	{
		label: 'Server boundary',
		value: 'db, auth, env, files, mutations',
	},
	{
		label: 'Deploy output',
		value: 'Node, Workers, Netlify, Railway',
	},
];

const rcChecklist = [
	{
		label: 'Pin the RC',
		body: 'Lock Start and Router packages instead of floating on broad ranges.',
	},
	{
		label: 'Track release notes',
		body: 'Treat version bumps as planned work and re-run the routes, loaders, and server functions that matter.',
	},
	{
		label: 'Report sharp edges',
		body: 'Small reproductions are still valuable while the final docs polish and last-mile fixes land.',
	},
];

const fieldNotes = [
	{
		title: 'Lovable builds new projects on Start',
		body: 'Lovable says projects created after May 13 are server-rendered and powered by TanStack Start, with type safety and deployment flexibility as core reasons.',
		source: 'Lovable',
		sourceDetail: 'Inside Lovable',
		href: 'https://lovable.dev/blog/building-apps-using-tanstack-start',
	},
	{
		title: 'Thoughtworks put Start on the Radar',
		body: 'Technology Radar Vol. 34 lists TanStack Start in Assess and calls out compile-time safety across server functions, loaders, and routing.',
		source: 'Thoughtworks',
		sourceDetail: 'Technology Radar',
		href: 'https://www.thoughtworks.com/content/dam/thoughtworks/documents/radar/2026/04/tr_technology_radar_vol_34_en.pdf',
	},
	{
		title: 'Bun documents Start in its ecosystem',
		body: "Bun's official guide covers creating, running, hosting, and templating TanStack Start apps, including production deployment paths.",
		source: 'Bun',
		sourceDetail: 'Ecosystem guide',
		href: 'https://bun.com/docs/guides/ecosystem/tanstack-start',
	},
	{
		title: 'Frontend Masters teaches the workflow',
		body: "Web Dev Simplified's Frontend Masters tutorial builds a complete full-stack project with TanStack Start and compares it to Next.js.",
		source: 'Frontend Masters',
		sourceDetail: 'Web Dev Simplified',
		href: 'https://frontendmasters.com/tutorials/webdevsimplified/tanstack-start/',
	},
];

export default function StartLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;

	return (
		<div className="w-full min-w-0 overflow-x-hidden bg-[#f6fbfb] text-zinc-950 dark:bg-zinc-950 dark:text-white">
			<section className="max-w-full overflow-hidden border-b border-cyan-950/10 bg-[#f4fbfb] dark:border-cyan-300/10 dark:bg-[#041010]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:py-12 xl:max-w-[92rem] 2xl:grid-cols-[0.78fr_1.22fr]">
					<div className="min-w-0 max-w-full sm:max-w-3xl">
						<p className="inline-flex items-center gap-2 text-sm font-black uppercase text-cyan-700 dark:text-cyan-300">
							<Sparkles size={14} aria-hidden="true" />
							Full-stack framework
						</p>

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
							The full-stack framework for Router-first apps.
						</p>

						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Start takes TanStack Router's typed route tree, URL state, loaders, and prefetching,
							then adds the server pieces: full-document SSR, streaming, server functions, server
							routes, and build output for the runtime you choose.
						</p>

						<LibraryDownloadsMicro
							animateIncreaseTrend
							library={library}
							className="mt-5"
							label="weekly downloads"
							period="weekly"
							showTotals
						/>

						<p className="mt-4 max-w-xl border-l-2 border-cyan-500 pl-3 text-sm font-black text-cyan-800 dark:text-cyan-200">
							The fastest-growing full-stack framework in the JavaScript ecosystem.
						</p>

						<div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
							<StartLink
								to="/$libraryId/$version/docs"
								params={{ libraryId: library.id, version: resolvedVersion }}
								label="Read the docs"
								icon={<BookOpen size={16} aria-hidden="true" />}
							/>
							<LandingCopyPromptButton getPrompt={getStartAgentPrompt} label="Copy Start Prompt" />
						</div>

						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							<ProofPill label="Built on Router" value="Routes, search, loaders, links" />
							<ProofPill
								label="Client-authored, server-powered"
								value="SSR, streaming, server functions"
							/>
							<ProofPill label="Portable output" value="Cloudflare, Railway, Netlify ready" />
						</div>
						<LandingEcosystemProof />
					</div>

					<div className="w-full min-w-0 max-w-full overflow-hidden">
						<StartRuntimePanel />
					</div>
				</div>
			</section>

			<section className="border-b border-cyan-950/10 bg-[#eefafa] dark:border-cyan-300/10 dark:bg-[#061515]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<Sparkles size={14} />}>Application builder</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Turn an app idea into a Start-ready implementation plan.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Pick a starting shape, describe the product, and let the builder assemble the TanStack
							libraries and partner integrations that fit the job. The output is a practical agent
							prompt, not a generic starter checklist.
						</p>
					</div>

					<div className="min-w-0 max-w-full overflow-hidden">
						<ApplicationStarter
							context="start"
							mode="compact"
							primaryActionLabel="Copy Start Prompt"
							secondaryActionLabel="Build Start on Netlify"
							title="Describe the app you want to build"
							tone="cyan"
						/>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.74fr_1.26fr]">
					<div>
						<SectionKicker icon={<GitBranch size={14} />}>Why Start</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Most of the framework is the route tree.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							If all you need is a SPA router, use Router. Start is for the moment the same app also
							needs SSR, streaming, server-only work, server routes, middleware, and deployable
							server output.
						</p>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						{featureCards.map((feature) => (
							<FeatureCard key={feature.title} {...feature} />
						))}
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fbfaf6] dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-6 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.9fr_1.1fr]">
					<div className="rounded-lg border border-cyan-200 bg-cyan-50 p-6 dark:border-cyan-900/70 dark:bg-cyan-950/20">
						<SectionKicker icon={<Rocket size={14} />}>RC status</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight">
							Feature-complete, still listening.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							The RC API is considered stable and preparing for 1.0. For production apps, lock
							dependencies to a specific version and keep up with the final feedback, docs polish,
							and last-mile fixes.
						</p>
						<div className="mt-6 rounded-lg border border-cyan-200/70 bg-white/75 p-4 dark:border-cyan-900/70 dark:bg-zinc-950/60">
							<p className="text-sm font-black text-cyan-950 dark:text-cyan-100">
								Production RC checklist
							</p>
							<div className="mt-3 grid gap-3">
								{rcChecklist.map((item) => (
									<div
										key={item.label}
										className="grid grid-cols-[auto_1fr] gap-2 text-sm leading-6 text-cyan-950 dark:text-cyan-100"
									>
										<CheckCircle2
											className="mt-1 h-4 w-4 text-cyan-700 dark:text-cyan-300"
											aria-hidden="true"
										/>
										<div>
											<span className="font-black">{item.label}</span>
											<span className="text-cyan-950/75 dark:text-cyan-100/75"> {item.body}</span>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						{fieldNotes.map((note) => (
							<FieldNoteCard key={note.title} {...note} />
						))}
					</div>
				</div>
			</section>

			<section className="bg-white py-12 dark:bg-zinc-950">
				<div className="mx-auto w-full max-w-[80rem] px-4">
					<div className="max-w-3xl">
						<SectionKicker icon={<GithubIcon className="h-4 w-4" />}>
							Open source ecosystem
						</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Partners and GitHub sponsors stay close to the product story.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Start is built in public, supported by maintainers, partner integrations, and sponsors
							who help keep the work moving.
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col gap-14">
					<LandingCommunitySection libraryId="start" />
					<SponsorSection title="GitHub Sponsors" aspectRatio="1/1" packMaxWidth="900px" showCTA />
				</div>
			</section>

			<BottomCTA
				linkProps={{
					to: '/$libraryId/$version/docs',
					params: { libraryId: library.id, version: resolvedVersion },
				}}
				label="Get Started!"
				className="border-cyan-500 bg-cyan-500 text-white hover:bg-cyan-600"
			/>
			<Footer />
		</div>
	);
}

function StartRuntimePanel() {
	return (
		<div className="min-w-0 w-full max-w-full overflow-hidden rounded-lg border border-cyan-200 bg-white p-4 shadow-sm shadow-cyan-950/5 dark:border-cyan-900 dark:bg-zinc-950">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				</div>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Router + server</span>
			</div>

			<div className="mt-4">
				<p className="text-sm font-black leading-5 text-zinc-950 dark:text-white">
					Start keeps Router as the application contract.
				</p>
				<p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
					Then it runs the server work Router shouldn't own: SSR, streaming, server functions,
					server routes, and deployable output.
				</p>
			</div>

			<div className="mt-4 grid gap-4 xl:grid-cols-[1.04fr_0.96fr]">
				<div className="min-w-0 overflow-hidden rounded-lg bg-zinc-950 p-4 text-zinc-100 shadow-inner shadow-black/20 dark:bg-black">
					<div className="flex min-w-0 items-center justify-between gap-3">
						<p className="min-w-0 truncate font-mono text-xs font-bold text-cyan-200">
							GET /projects/tanstack?tab=activity
						</p>
						<span className="shrink-0 rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[0.65rem] font-black uppercase leading-none text-emerald-200">
							server first
						</span>
					</div>

					<div className="mt-4 min-w-0 overflow-x-auto pb-1 font-mono text-[0.72rem] leading-5">
						<p className="whitespace-nowrap">
							<span className="text-pink-300">export const</span>{' '}
							<span className="text-white">Route</span> = createFileRoute(
							<span className="text-emerald-300">'/_app/projects/$id'</span>)(
							{'{'}
						</p>
						<p className="whitespace-nowrap pl-4">
							validateSearch: <span className="text-emerald-300">projectSearchSchema</span>,
						</p>
						<p className="whitespace-nowrap pl-4">
							loader: ({'{'} context, params {'}'}) =&gt;
						</p>
						<p className="whitespace-nowrap pl-8">
							context.queryClient.ensureQueryData(projectQuery(params.id)),
						</p>
						<p className="whitespace-nowrap">{'})'}</p>
						<p className="mt-3 whitespace-nowrap text-zinc-400">
							<span className="text-pink-300">const</span>{' '}
							<span className="text-cyan-300">getProject</span> = createServerFn({'{'} method:{' '}
							<span className="text-emerald-300">'GET'</span> {'}'})
						</p>
						<p className="whitespace-nowrap pl-4 text-zinc-400">
							.handler(({'{'} data {'}'}) =&gt; db.project.find(data.id))
						</p>
					</div>
				</div>

				<div className="rounded-lg bg-cyan-50 p-4 dark:bg-cyan-950/30">
					<div className="flex items-center justify-between gap-3">
						<p className="text-sm font-black text-cyan-950 dark:text-cyan-100">Request trace</p>
						<span className="inline-flex items-center gap-1.5 rounded-md bg-white px-1.5 py-0.5 text-[0.65rem] font-black uppercase text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">
							<span className="h-1.5 w-1.5 rounded-full bg-cyan-500 motion-safe:animate-pulse" />
							streaming
						</span>
					</div>

					<div className="mt-4 grid gap-3">
						{startRuntimeSteps.map((step, index) => {
							const isLastStep = index === startRuntimeSteps.length - 1;

							return (
								<div key={step.label} className="grid grid-cols-[2rem_1fr] gap-3">
									<span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-200 bg-white text-xs font-black text-cyan-800 dark:border-cyan-800 dark:bg-zinc-950 dark:text-cyan-200">
										{index + 1}
									</span>
									<div
										className={
											isLastStep
												? 'min-w-0'
												: 'min-w-0 border-b border-cyan-200/70 pb-3 dark:border-cyan-800/70'
										}
									>
										<div className="flex min-w-0 items-start justify-between gap-3">
											<p className="text-sm font-black leading-5 text-zinc-950 dark:text-white">
												{step.label}
											</p>
											<p className="min-w-0 truncate font-mono text-[0.65rem] font-bold text-cyan-800/80 dark:text-cyan-100/75">
												{step.file}
											</p>
										</div>
										<p className="mt-1 text-xs leading-5 text-cyan-950/75 dark:text-cyan-100/75">
											{step.body}
										</p>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			<div className="mt-4 grid gap-3 sm:grid-cols-3">
				{startRuntimeOutputs.map((output) => (
					<div
						key={output.label}
						className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
					>
						<p className="text-xs font-black text-zinc-950 dark:text-white">{output.label}</p>
						<p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
							{output.value}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}

function SectionKicker({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
	return (
		<p className="inline-flex items-center gap-2 text-sm font-black uppercase text-zinc-600 dark:text-zinc-400">
			{icon}
			{children}
		</p>
	);
}

function ProofPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-l-2 border-cyan-500 pl-3">
			<p className="text-sm font-black text-zinc-950 dark:text-white">{label}</p>
			<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value}</p>
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
		<div className="rounded-lg border border-zinc-200 bg-[#fbfaf7] p-5 dark:border-zinc-800 dark:bg-zinc-900">
			<div className="flex items-center gap-3">
				<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">
					{icon}
				</span>
				<h3 className="text-xl font-black leading-tight">{title}</h3>
			</div>
			<p className="mt-4 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
		</div>
	);
}

function FieldNoteCard({
	body,
	href,
	source,
	sourceDetail,
	title,
}: {
	body: string;
	href: string;
	source: string;
	sourceDetail: string;
	title: string;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="group flex min-h-48 flex-col justify-between rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-cyan-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-cyan-800"
		>
			<div>
				<div className="flex items-start justify-between gap-4">
					<p className="text-xs font-black uppercase text-cyan-700 dark:text-cyan-300">{source}</p>
					<ExternalLink
						className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 transition-colors group-hover:text-cyan-600 dark:group-hover:text-cyan-300"
						aria-hidden="true"
					/>
				</div>
				<h3 className="mt-3 text-lg font-black leading-tight text-zinc-950 dark:text-white">
					{title}
				</h3>
				<p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
			</div>
			<p className="mt-5 text-xs font-bold text-zinc-500 dark:text-zinc-400">{sourceDetail}</p>
		</a>
	);
}

function StartLink({
	icon,
	label,
	muted = false,
	params,
	to,
}: {
	icon: React.ReactNode;
	label: string;
	muted?: boolean;
	params: Record<string, string>;
	to: string;
}) {
	return (
		<Link
			to={to}
			params={params}
			className={
				muted
					? 'inline-flex w-full max-w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-bold text-zinc-900 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-500 sm:w-auto'
					: 'inline-flex w-full max-w-full items-center justify-center gap-2 rounded-lg border border-zinc-950 bg-zinc-950 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 sm:w-auto'
			}
		>
			{icon}
			{label}
			<ArrowRight size={15} aria-hidden="true" />
		</Link>
	);
}

function getStartBlankStarterInput() {
	const blankStarter = getApplicationStarterSuggestions('start').find(
		(suggestion) => suggestion.label === 'Blank starter',
	);

	return (
		blankStarter?.input ??
		'Create a blank TanStack Start app with no extra integrations or feature scaffolding.'
	);
}

async function getStartAgentPrompt() {
	if (cachedStartAgentPrompt) {
		return cachedStartAgentPrompt;
	}

	const result = await resolveApplicationStarterDeterministically({
		context: 'start',
		input: startBlankStarterInput,
	});

	cachedStartAgentPrompt = result.prompt;
	return cachedStartAgentPrompt;
}
