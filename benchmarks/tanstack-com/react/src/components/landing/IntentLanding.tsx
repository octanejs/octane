import * as React from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
	ArrowRight,
	BookOpen,
	Bot,
	FileSearch,
	GitBranch,
	Package,
	PackageCheck,
	RefreshCw,
	ScanLine,
	Sparkles,
	WandSparkles,
} from 'lucide-react';

import { BottomCTA } from '~/components/BottomCTA';
import { Footer } from '~/components/Footer';
import { GithubIcon } from '~/components/icons/GithubIcon';
import { SkillSparkline } from '~/components/intent/SkillSparkline';
import LandingPageGad from '~/components/LandingPageGad';
import { LandingCommunitySection } from '~/components/LandingCommunitySection';
import { SponsorSection } from '~/components/SponsorSection';
import { LibraryDownloadsMicro } from '~/components/LibraryDownloadsMicro';
import { LibraryWordmark } from '~/components/LibraryWordmark';
import { getLibrary } from '~/libraries';
import {
	intentDirectoryQueryOptions,
	intentSkillHistoryQueryOptions,
	intentStatsQueryOptions,
} from '~/queries/intent';
import type { SkillHistoryEntry } from '~/utils/intent.functions';
import { encodePackageNameSlug } from '~/utils/route-encoding';

import { LandingCopyPromptButton } from '~/components/landing/LandingCopyPromptButton';
const library = getLibrary('intent');
const intentAgentPrompt = [
	'Ship Agent Skills with a TypeScript npm package using TanStack Intent.',
	'Generate, validate, and publish versioned skills that agents can discover from node_modules, include source-doc references, and run stale checks in CI when documentation changes.',
	'Show the package registry, skill history, versioned updates, and how skills travel with npm releases instead of depending on model training cutoffs.',
].join(' ');

const heroProof = [
	{
		label: 'In npm',
		value: 'skills version with the package',
	},
	{
		label: 'Discoverable',
		value: 'agents load from node_modules',
	},
	{
		label: 'Freshness',
		value: 'source docs and stale checks',
	},
];

const packageFiles = [
	['package.json', 'keywords and files entries'],
	['skills/router/SKILL.md', 'procedural agent knowledge'],
	['docs/routing.md', 'source reference'],
	['stale report', 'flags source drift'],
];

const featureCards = [
	{
		title: 'Skills travel with library versions.',
		body: 'Agent guidance updates through npm releases instead of waiting for model training data or copied prompt files to catch up.',
		icon: <Package size={18} />,
	},
	{
		title: 'Discovery happens from node_modules.',
		body: 'Install the package and compatible agents can find the skill metadata where the code already lives.',
		icon: <Bot size={18} />,
	},
	{
		title: 'Source docs keep skills accountable.',
		body: 'Skills declare the docs they depend on, so stale checks can flag them when the source material changes.',
		icon: <FileSearch size={18} />,
	},
	{
		title: 'The registry makes the ecosystem visible.',
		body: 'Packages, skills, versions, download signals, and history become browsable instead of hidden inside package tarballs.',
		icon: <ScanLine size={18} />,
	},
];

const lifecycleSteps = [
	{
		label: 'Author',
		body: 'Write the procedural skill close to the library and its source docs.',
	},
	{
		label: 'Validate',
		body: 'Check metadata, source references, and skill structure before release.',
	},
	{
		label: 'Publish',
		body: 'Ship the skill with the npm package version that contains the code.',
	},
	{
		label: 'Discover',
		body: 'Agents load versioned skills from installed packages on demand.',
	},
];

export default function IntentLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;

	return (
		<div className="w-full min-w-0 overflow-x-hidden bg-[#f0f9ff] text-zinc-950 dark:bg-zinc-950 dark:text-white">
			<section className="max-w-full overflow-hidden border-b border-sky-950/10 bg-[#e0f2fe] dark:border-sky-300/10 dark:bg-[#061522]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.84fr_1.16fr] lg:items-start lg:py-12 xl:max-w-[92rem]">
					<div className="min-w-0 max-w-full sm:max-w-3xl">
						<SectionKicker icon={<WandSparkles size={14} />}>Agent skills in npm</SectionKicker>

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
							Package the knowledge agents need with the library itself.
						</p>

						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Intent lets maintainers generate, validate, publish, and track Agent Skills alongside
							npm packages, so agents discover current procedural knowledge from installed code
							instead of stale model memory.
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
							<IntentLink
								to="/$libraryId/$version/docs"
								params={{ libraryId: library.id, version: resolvedVersion }}
								label="Read the docs"
								icon={<BookOpen size={16} aria-hidden="true" />}
							/>
							<IntentSecondaryLink
								to="/intent/registry"
								label="View Registry"
								icon={<PackageCheck size={16} aria-hidden="true" />}
							/>
							<LandingCopyPromptButton prompt={intentAgentPrompt} label="Copy Intent Prompt" />
						</div>

						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							{heroProof.map((proof) => (
								<ProofPill key={proof.label} {...proof} />
							))}
						</div>
					</div>

					<IntentPackagePanel />
				</div>
			</section>

			<section className="border-b border-sky-950/10 bg-[#f4fbff] dark:border-sky-300/10 dark:bg-[#071b2b]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.74fr_1.26fr] xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Sparkles size={14} />}>Why Intent</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Libraries need to ship agent knowledge, not just code.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Agents are only as useful as the procedural context they can retrieve. Intent gives
							library authors a way to version that context with the package and keep it tied to the
							docs it came from.
						</p>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						{featureCards.map((feature) => (
							<FeatureCard key={feature.title} {...feature} />
						))}
					</div>
				</div>
			</section>

			<IntentRegistryPreview />

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[1.05fr_0.95fr] lg:items-center xl:max-w-[92rem]">
					<LifecyclePanel />
					<div>
						<SectionKicker icon={<GitBranch size={14} />}>Skill lifecycle</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Author, validate, publish, discover.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Skills become part of the library release process. They are written near the source,
							validated like package artifacts, and discovered by agents from installed
							dependencies.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fbfaf6] dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<RefreshCw size={14} />}>Staleness checks</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							If the docs drift, the skill should know.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Intent can compare skill source references against documentation changes, making skill
							freshness a release signal instead of a guess.
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
							Intent helps open source libraries teach agents how to use them.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Maintainers, package authors, examples, partners, and GitHub sponsors keep agent
							skills close to the libraries they describe.
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col gap-14">
					<LandingCommunitySection libraryId="intent" />
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
				className="border-sky-500 bg-sky-500 text-white hover:bg-sky-600"
			/>
			<Footer />
		</div>
	);
}

function IntentPackagePanel() {
	const [activeFileIndex, setActiveFileIndex] = React.useState(1);
	const activeFile = packageFiles[activeFileIndex] ?? packageFiles[0];

	return (
		<div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-sky-200 bg-white p-4 shadow-sm shadow-sky-950/5 dark:border-sky-900 dark:bg-zinc-950">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				</div>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
					package skill map
				</span>
			</div>

			<div className="mt-4 rounded-lg bg-zinc-950 p-4 text-sm text-sky-100 dark:bg-black">
				<p className="font-mono leading-6">
					npx @tanstack/intent scaffold
					<br />
					npx @tanstack/intent validate {activeFile[0]}
					<br />
					npx @tanstack/intent stale --json
				</p>
			</div>

			<div className="mt-4 space-y-2">
				{packageFiles.map(([file, detail], index) => (
					<button
						key={file}
						aria-pressed={activeFileIndex === index}
						className={
							activeFileIndex === index
								? 'grid w-full gap-2 rounded-lg border border-sky-500 bg-sky-500 p-3 text-left text-white sm:grid-cols-[0.45fr_1fr]'
								: 'grid w-full gap-2 rounded-lg border border-zinc-200 bg-sky-50 p-3 text-left transition-colors hover:border-sky-300 dark:border-zinc-800 dark:bg-sky-950/20 dark:hover:border-sky-800 sm:grid-cols-[0.45fr_1fr]'
						}
						type="button"
						onClick={() => setActiveFileIndex(index)}
					>
						<span className="font-mono text-sm font-black">{file}</span>
						<span
							className={
								activeFileIndex === index
									? 'text-sm text-white/80'
									: 'text-sm text-zinc-700 dark:text-zinc-300'
							}
						>
							{detail}
						</span>
					</button>
				))}
			</div>
		</div>
	);
}

function IntentRegistryPreview() {
	const statsQuery = useQuery(intentStatsQueryOptions());
	const directoryQuery = useQuery(intentDirectoryQueryOptions({ sort: 'downloads', pageSize: 9 }));

	const stats = statsQuery.data;
	const packages = directoryQuery.data?.packages;

	const packageNames = React.useMemo(() => (packages ?? []).map((p) => p.name), [packages]);
	const skillHistoryQuery = useQuery(intentSkillHistoryQueryOptions(packageNames));
	const skillHistory = React.useMemo(() => skillHistoryQuery.data ?? {}, [skillHistoryQuery.data]);
	const maxSlots = React.useMemo(
		() => Math.max(...Object.values(skillHistory).map((h) => h.length), 2),
		[skillHistory],
	);

	const navigate = useNavigate();

	if (!statsQuery.isLoading && (stats?.packageCount ?? 0) === 0) {
		return null;
	}

	return (
		<section className="border-b border-zinc-200 bg-white py-12 dark:border-zinc-800 dark:bg-zinc-950">
			<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
				<div className="mb-6 flex items-end justify-between gap-4">
					<div>
						<SectionKicker icon={<PackageCheck size={14} />}>Skills Registry</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight">
							Browse the packages already shipping skills.
						</h2>
						<p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
							{stats ? (
								<>
									<span className="font-black text-sky-600 dark:text-sky-400">
										{stats.packageCount}
									</span>{' '}
									{stats.packageCount === 1 ? 'package' : 'packages'},{' '}
									<span className="font-black text-sky-600 dark:text-sky-400">
										{stats.skillCount}
									</span>{' '}
									{stats.skillCount === 1 ? 'skill' : 'skills'} indexed
								</>
							) : (
								'Loading...'
							)}
						</p>
					</div>
					<Link
						to="/intent/registry"
						className="shrink-0 text-sm font-bold text-sky-600 hover:underline dark:text-sky-400"
					>
						Browse all
					</Link>
				</div>

				{packages && packages.length > 0 ? (
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{packages.map((pkg) => (
							<Link
								key={pkg.name}
								to="/intent/registry/$packageName"
								params={{ packageName: encodePackageNameSlug(pkg.name) }}
								className="group flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition-colors hover:border-sky-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-sky-700"
							>
								<div className="mb-1 flex items-start justify-between gap-2">
									<span className="truncate font-mono text-sm font-black text-zinc-900 transition-colors group-hover:text-sky-600 dark:text-zinc-100 dark:group-hover:text-sky-400">
										{pkg.name}
									</span>
									<div className="w-20 shrink-0">
										{skillHistory[pkg.name] && skillHistory[pkg.name].length > 0 ? (
											<SkillSparkline
												history={skillHistory[pkg.name]}
												height={24}
												maxSlots={maxSlots}
												onVersionClick={(entry: SkillHistoryEntry) => {
													navigate({
														to: '/intent/registry/$packageName',
														params: {
															packageName: encodePackageNameSlug(pkg.name),
														},
														search: { version: entry.version },
													});
												}}
											/>
										) : null}
									</div>
								</div>
								<div className="flex items-center gap-3 text-[11px] text-zinc-400 dark:text-zinc-500">
									<span className="shrink-0 text-xs font-bold tabular-nums text-sky-600 dark:text-sky-400">
										{pkg.skillNames.length} {pkg.skillNames.length === 1 ? 'skill' : 'skills'}
									</span>
									{pkg.monthlyDownloads > 0 ? (
										<span className="tabular-nums">
											{pkg.monthlyDownloads >= 1_000_000
												? `${(pkg.monthlyDownloads / 1_000_000).toFixed(1)}M`
												: pkg.monthlyDownloads >= 1_000
													? `${Math.floor(pkg.monthlyDownloads / 1_000)}K`
													: pkg.monthlyDownloads}
											/mo
										</span>
									) : null}
									<span className="font-mono">v{pkg.latestVersion}</span>
									{pkg.frameworks.length > 0 ? (
										<span>{pkg.frameworks.slice(0, 2).join(', ')}</span>
									) : null}
								</div>
								{pkg.description ? (
									<p className="line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
										{pkg.description}
									</p>
								) : null}
							</Link>
						))}
					</div>
				) : directoryQuery.isLoading ? (
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{Array.from({ length: 6 }).map((_, i) => (
							<div
								key={i}
								className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30"
							/>
						))}
					</div>
				) : null}
			</div>
		</section>
	);
}

function LifecyclePanel() {
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{lifecycleSteps.map((step, index) => (
				<div
					key={step.label}
					className="rounded-lg border border-zinc-200 bg-[#f0f9ff] p-4 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sm font-black text-sky-800 dark:bg-sky-950 dark:text-sky-200">
						{index + 1}
					</span>
					<h3 className="mt-4 text-lg font-black leading-tight">{step.label}</h3>
					<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{step.body}</p>
				</div>
			))}
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
			<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200">
				{icon}
			</span>
			<h3 className="mt-4 text-xl font-black leading-tight">{title}</h3>
			<p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
		</div>
	);
}

function SectionKicker({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
	return (
		<p className="inline-flex items-center gap-2 text-sm font-black uppercase text-sky-700 dark:text-sky-300">
			{icon}
			{children}
		</p>
	);
}

function ProofPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-l-2 border-sky-500 pl-3">
			<p className="text-sm font-black text-zinc-950 dark:text-white">{label}</p>
			<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value}</p>
		</div>
	);
}

function IntentLink({
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

function IntentSecondaryLink({
	icon,
	label,
	to,
}: {
	icon: React.ReactNode;
	label: string;
	to: string;
}) {
	return (
		<Link
			to={to}
			className="inline-flex w-full max-w-full items-center justify-center gap-2 rounded-lg border border-sky-300 bg-transparent px-4 py-2.5 text-sm font-bold text-sky-700 transition-colors hover:bg-sky-500/10 dark:border-sky-700 dark:text-sky-300 sm:w-auto"
		>
			{icon}
			{label}
			<ArrowRight size={15} aria-hidden="true" />
		</Link>
	);
}
