import * as React from 'react';
import { Link, useParams } from '@tanstack/react-router';
import {
	ArrowRight,
	BookOpen,
	Boxes,
	ClipboardCheck,
	FileCheck2,
	GitBranch,
	PackageCheck,
	ScanLine,
	ShieldCheck,
	Sparkles,
	TerminalSquare,
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
const library = getLibrary('config');
const configAgentPrompt = [
	'Set up TanStack Config for a TypeScript package.',
	'Use the opinionated ESLint, Vite package build, CI/CD, package structure, and publish defaults while keeping project-specific configuration minimal and explicit.',
	'Show how the package should produce publint-friendly output, Changesets-backed releases, and repeatable local/CI workflows.',
].join(' ');

const heroProof = [
	{
		label: 'Build',
		value: 'Vite-powered package output',
	},
	{
		label: 'Validate',
		value: 'ESLint, tests, package checks',
	},
	{
		label: 'Release',
		value: 'Changesets, npm + GitHub',
	},
];

const releaseRows = [
	['typecheck', 'passed'],
	['lint', 'passed'],
	['package exports', 'verified'],
	['changesets', 'ready'],
	['npm publish', 'ready'],
];

const featureCards = [
	{
		title: 'Opinionated where packages are repetitive.',
		body: 'Linting, package builds, CI tasks, publishing, and release hygiene should not become bespoke work in every package repo.',
		icon: <ClipboardCheck size={18} />,
	},
	{
		title: 'Vite ecosystem without a hand-built pipeline.',
		body: 'Use modern build primitives and package output conventions without rebuilding the same config stack for every library.',
		icon: <TerminalSquare size={18} />,
	},
	{
		title: 'Publishing rules stay visible.',
		body: 'Exports, package metadata, release branches, and npm publish behavior can be reviewed as part of the same workflow.',
		icon: <PackageCheck size={18} />,
	},
	{
		title: 'Minimal config, consistent results.',
		body: 'The point is not zero configuration forever. It is a small surface where deviations are intentional and easy to audit.',
		icon: <ShieldCheck size={18} />,
	},
];

const pipelineSteps = [
	{
		label: 'Author',
		body: 'Write library code while package defaults handle the routine surrounding work.',
	},
	{
		label: 'Build',
		body: 'Generate package output with consistent module, types, and export expectations.',
	},
	{
		label: 'Verify',
		body: 'Run type, lint, test, package, and publication checks before release.',
	},
	{
		label: 'Publish',
		body: 'Version, tag, and publish through a repeatable release path.',
	},
];

const auditSignals = [
	{
		label: 'exports',
		value: './dist/index.js + types',
	},
	{
		label: 'publint',
		value: 'package shape checked',
	},
	{
		label: 'changesets',
		value: 'versioning ready',
	},
	{
		label: 'release',
		value: 'npm + GitHub ready',
	},
];

export default function ConfigLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;

	return (
		<div className="w-full min-w-0 overflow-x-hidden bg-zinc-100 text-zinc-950 dark:bg-zinc-950 dark:text-white">
			<section className="max-w-full overflow-hidden border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.84fr_1.16fr] lg:items-start lg:py-12 xl:max-w-[92rem]">
					<div className="min-w-0 max-w-full sm:max-w-3xl">
						<SectionKicker icon={<FileCheck2 size={14} />}>
							Package maintenance tooling
						</SectionKicker>

						<h1 className="mt-4 text-5xl font-black leading-[0.95] sm:text-6xl lg:text-7xl">
							<LibraryWordmark library={library} />
						</h1>

						<p className="mt-5 max-w-2xl text-lg font-bold leading-8 text-zinc-900 dark:text-zinc-100 sm:text-xl">
							Make package publishing boring in the best way.
						</p>

						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Config is the opinionated toolchain TanStack uses to keep JavaScript packages linted,
							built, tested in CI, versioned with Changesets, and published with minimal per-package
							ceremony.
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
							<ConfigLink
								to="/$libraryId/$version/docs"
								params={{ libraryId: library.id, version: resolvedVersion }}
								label="Read the docs"
								icon={<BookOpen size={16} aria-hidden="true" />}
							/>
							<LandingCopyPromptButton prompt={configAgentPrompt} label="Copy Config Prompt" />
						</div>

						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							{heroProof.map((proof) => (
								<ProofPill key={proof.label} {...proof} />
							))}
						</div>
					</div>

					<ReleasePanel />
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.74fr_1.26fr] xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Sparkles size={14} />}>Why Config</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Package quality is mostly repetitive work.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Every library needs the same boring promises: exports resolve, types ship, tests pass,
							release branches are configured, and npm publishes what consumers expect. Config turns
							that repetition into shared defaults.
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
					<PipelinePanel />
					<div>
						<SectionKicker icon={<GitBranch size={14} />}>Release pipeline</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Local and CI should agree about what shipping means.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Config gives package repos a shared path from source code to published artifact, so
							maintainers spend less time debugging the release machinery itself.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fbfaf6] dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.82fr_1.18fr] lg:items-start xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<ScanLine size={14} />}>Package audit</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							The artifact matters as much as the source.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							The consumer sees your package boundary: exports, module formats, types, metadata,
							release branch, and version. Config keeps that boundary part of the workflow.
						</p>
					</div>

					<AuditPanel />
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<Boxes size={14} />}>Maintainer ergonomics</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Defaults for the parts nobody wants to rediscover.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Use Config when the repo should feel like a TanStack package: predictable scripts,
							modern build output, release automation, and a small escape hatch when the package
							needs something special.
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
							Config exists because maintaining packages is real work.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Maintainers, examples, partners, and GitHub sponsors help keep the boring parts of
							package publishing reliable for the libraries built on top.
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col gap-14">
					<LandingCommunitySection libraryId="config" />
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

function ReleasePanel() {
	const [completedRows, setCompletedRows] = React.useState(
		() => new Set(releaseRows.map(([label]) => label)),
	);
	const completedCount = completedRows.size;
	const toggleRow = (label: string) => {
		setCompletedRows((current) => {
			const next = new Set(current);

			if (next.has(label)) {
				next.delete(label);
			} else {
				next.add(label);
			}

			return next;
		});
	};

	return (
		<div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-zinc-300 bg-white p-4 shadow-sm shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-950">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				</div>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
					release checklist
				</span>
			</div>

			<div className="mt-4 rounded-lg bg-zinc-950 p-4 text-sm text-zinc-100 dark:bg-black">
				<p className="font-mono leading-6">
					vite build &amp;&amp; publint --strict
					<br />
					nx affected
					<br />
					changesets {completedCount}/{releaseRows.length}
					<br />
					publish config: branchConfigs, packages, npm, github{' '}
					{completedCount === releaseRows.length ? '--ready' : '--blocked'}
				</p>
			</div>

			<div className="mt-4 space-y-2">
				{releaseRows.map(([label, state]) => (
					<button
						key={label}
						aria-pressed={completedRows.has(label)}
						className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
						type="button"
						onClick={() => toggleRow(label)}
					>
						<span className="font-bold">{label}</span>
						<span
							className={
								completedRows.has(label)
									? 'rounded-md bg-emerald-100 px-2 py-1 text-[0.65rem] font-black uppercase text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
									: 'rounded-md bg-amber-100 px-2 py-1 text-[0.65rem] font-black uppercase text-amber-800 dark:bg-amber-950 dark:text-amber-200'
							}
						>
							{completedRows.has(label) ? state : 'pending'}
						</span>
					</button>
				))}
			</div>
		</div>
	);
}

function PipelinePanel() {
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{pipelineSteps.map((step, index) => (
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

function AuditPanel() {
	return (
		<div className="min-w-0 rounded-lg border border-zinc-300 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
			<div className="grid gap-3 md:grid-cols-2">
				{auditSignals.map((signal) => (
					<div
						key={signal.label}
						className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
					>
						<p className="text-[0.65rem] font-black uppercase text-zinc-500 dark:text-zinc-400">
							{signal.label}
						</p>
						<p className="mt-2 text-sm font-bold leading-6 text-zinc-950 dark:text-white">
							{signal.value}
						</p>
					</div>
				))}
			</div>

			<div className="mt-4 rounded-lg bg-zinc-950 p-4 text-sm text-zinc-100 dark:bg-black">
				<p className="font-mono leading-6">
					package.json exports
					<br />
					dist/index.js
					<br />
					dist/index.d.ts
					<br />
					.changeset/*.md
				</p>
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

function ConfigLink({
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
