import * as React from 'react';
import { Link, useParams } from '@tanstack/react-router';
import {
	ArrowRight,
	Bot,
	BookOpen,
	FileCode2,
	GitBranch,
	Layers,
	PackagePlus,
	Puzzle,
	Sparkles,
	Terminal,
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
const library = getLibrary('cli');
const cliAgentPrompt = [
	'Use TanStack CLI for a TanStack project workflow.',
	'Show how the CLI, Builder, docs search, and modular integrations can scaffold or modify a TanStack Start app with auth, database, styling, deployment, and package-specific best practices.',
	'Keep generated changes inspectable and grounded in TanStack docs instead of relying on generic framework assumptions.',
].join(' ');

const heroProof = [
	{
		label: 'CLI',
		value: 'project commands and generated changes',
	},
	{
		label: 'Docs',
		value: 'search, fetch, and introspect',
	},
	{
		label: 'Builder',
		value: 'visual stack selection and export',
	},
];

const commandRows = [
	['search-docs', '"router loaders" --library router'],
	['create', 'my-app --add-ons clerk,drizzle'],
	['libraries', '--group state --json'],
	['ecosystem', '--category database --json'],
];

const featureCards = [
	{
		title: 'A CLI that knows TanStack instead of guessing.',
		body: 'Commands can start from TanStack docs, packages, examples, and integration metadata rather than generic project templates.',
		icon: <Terminal size={18} />,
	},
	{
		title: 'CLI introspection turns docs into agent context.',
		body: 'Use JSON commands for docs, libraries, add-ons, and ecosystem data so generated work can reference current TanStack conventions.',
		icon: <Bot size={18} />,
	},
	{
		title: 'Integrations become selectable building blocks.',
		body: 'Auth, databases, styling, deployment, and more can be composed into a Start-ready app without burying every choice in hand-written setup.',
		icon: <Puzzle size={18} />,
	},
	{
		title: 'The Builder makes the stack visible.',
		body: 'Use the web UI to select libraries and partners, preview generated choices, and export a plan the CLI or agent can execute.',
		icon: <Layers size={18} />,
	},
];

const workflowSteps = [
	{
		label: 'Discover',
		body: 'Search docs, examples, packages, and integrations through direct CLI commands.',
	},
	{
		label: 'Choose',
		body: 'Select libraries, partners, deployment targets, and app shape.',
	},
	{
		label: 'Generate',
		body: 'Create or modify files with TanStack-specific conventions in mind.',
	},
	{
		label: 'Review',
		body: 'Inspect the generated plan and project changes before shipping.',
	},
];

const builderOutputs = [
	{
		label: 'libraries',
		value: 'Start, Router, Query, Form',
	},
	{
		label: 'partners',
		value: 'Cloudflare, Clerk, Drizzle',
	},
	{
		label: 'files',
		value: 'routes, server fns, env, deploy config',
	},
	{
		label: 'CLI config',
		value: '.tanstack.json and chosen add-ons',
	},
];

export default function CliLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;

	return (
		<div className="w-full min-w-0 overflow-x-hidden bg-[#eef2ff] text-zinc-950 dark:bg-zinc-950 dark:text-white">
			<section className="max-w-full overflow-hidden border-b border-indigo-950/10 bg-[#e0e7ff] dark:border-indigo-300/10 dark:bg-[#090b1e]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.84fr_1.16fr] lg:items-start lg:py-12 xl:max-w-[92rem]">
					<div className="min-w-0 max-w-full sm:max-w-3xl">
						<SectionKicker icon={<Terminal size={14} />}>CLI, add-ons, and Builder</SectionKicker>

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
							Turn TanStack knowledge into project changes.
						</p>

						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							CLI brings together project commands, docs search, modular integrations, and the
							Builder so TanStack Start apps can be scaffolded and customized with current TanStack
							context.
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
							<CliLink
								to="/$libraryId/$version/docs"
								params={{ libraryId: library.id, version: resolvedVersion }}
								label="Read the docs"
								icon={<BookOpen size={16} aria-hidden="true" />}
							/>
							<CliSecondaryLink
								to="/builder"
								label="Try the Builder"
								icon={<Layers size={16} aria-hidden="true" />}
							/>
							<LandingCopyPromptButton prompt={cliAgentPrompt} label="Copy CLI Prompt" />
						</div>

						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							{heroProof.map((proof) => (
								<ProofPill key={proof.label} {...proof} />
							))}
						</div>
					</div>

					<CliWorkbenchPanel />
				</div>
			</section>

			<section className="border-b border-indigo-950/10 bg-[#f4f6ff] dark:border-indigo-300/10 dark:bg-[#0e1026]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.74fr_1.26fr] xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Sparkles size={14} />}>Why CLI</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Project setup is where documentation meets the filesystem.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							The hard part is not printing a template. It is choosing the right TanStack libraries,
							wiring partner integrations, following current docs, and leaving the user with a
							project they can understand.
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
					<WorkflowPanel />
					<div>
						<SectionKicker icon={<GitBranch size={14} />}>Project workflow</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Discover, choose, generate, review.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							CLI should help a team move from product intent to project files without hiding the
							important decisions behind a magic template.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fbfaf6] dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.82fr_1.18fr] lg:items-start xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<PackagePlus size={14} />}>Builder output</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Make the stack visible before files change.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							The Builder turns app intent into a readable stack brief: TanStack libraries, partner
							integrations, deployment target, generated files, and CLI-ready configuration.
						</p>
					</div>

					<BuilderPanel />
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<FileCode2 size={14} />}>Developer ergonomics</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Generated code should still feel authored.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							CLI is strongest when it gives teams inspectable changes, traceable docs context, and
							a clear path back to the choices that produced the project.
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
							CLI connects the docs, packages, partners, and people.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Maintainers, integrations, examples, partners, and GitHub sponsors keep the project
							workflow grounded in real TanStack usage.
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col gap-14">
					<LandingCommunitySection libraryId="cli" />
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
				className="border-indigo-500 bg-indigo-500 text-white hover:bg-indigo-600"
			/>
			<Footer />
		</div>
	);
}

function CliWorkbenchPanel() {
	const [activeCommandIndex, setActiveCommandIndex] = React.useState(0);
	const activeCommand = commandRows[activeCommandIndex] ?? commandRows[0];
	const activeCommandPreview = `npx @tanstack/cli ${activeCommand[0]} ${activeCommand[1]}`;

	return (
		<div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-indigo-200 bg-white p-4 shadow-sm shadow-indigo-950/5 dark:border-indigo-900 dark:bg-zinc-950">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				</div>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">tanstack cli</span>
			</div>

			<div className="mt-4 rounded-lg bg-zinc-950 p-4 text-sm text-indigo-100 dark:bg-black">
				<p className="font-mono leading-6">
					npx @tanstack/cli create --list-add-ons --json
					<br />
					{activeCommandPreview}
					<br />
					npx @tanstack/cli doc query framework/react/overview --json
				</p>
			</div>

			<div className="mt-4 grid gap-3 md:grid-cols-2">
				{commandRows.map(([label, value], index) => (
					<button
						key={label}
						aria-pressed={activeCommandIndex === index}
						className={
							activeCommandIndex === index
								? 'rounded-lg border border-indigo-500 bg-indigo-500 p-4 text-left text-white'
								: 'rounded-lg border border-zinc-200 bg-indigo-50 p-4 text-left transition-colors hover:border-indigo-300 dark:border-zinc-800 dark:bg-indigo-950/20 dark:hover:border-indigo-800'
						}
						type="button"
						onClick={() => setActiveCommandIndex(index)}
					>
						<p
							className={
								activeCommandIndex === index
									? 'text-[0.65rem] font-black uppercase text-white/75'
									: 'text-[0.65rem] font-black uppercase text-indigo-700 dark:text-indigo-300'
							}
						>
							{label}
						</p>
						<p className="mt-2 text-sm font-bold leading-6">{value}</p>
					</button>
				))}
			</div>
		</div>
	);
}

function WorkflowPanel() {
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{workflowSteps.map((step, index) => (
				<div
					key={step.label}
					className="rounded-lg border border-zinc-200 bg-[#eef2ff] p-4 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-sm font-black text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
						{index + 1}
					</span>
					<h3 className="mt-4 text-lg font-black leading-tight">{step.label}</h3>
					<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{step.body}</p>
				</div>
			))}
		</div>
	);
}

function BuilderPanel() {
	return (
		<div className="min-w-0 rounded-lg border border-indigo-200 bg-white p-4 dark:border-indigo-900 dark:bg-zinc-950">
			<div className="grid gap-3 md:grid-cols-2">
				{builderOutputs.map((output) => (
					<div
						key={output.label}
						className="rounded-lg border border-zinc-200 bg-[#f4f6ff] p-4 dark:border-zinc-800 dark:bg-zinc-900"
					>
						<p className="text-[0.65rem] font-black uppercase text-zinc-500 dark:text-zinc-400">
							{output.label}
						</p>
						<p className="mt-2 text-sm font-bold leading-6 text-zinc-950 dark:text-white">
							{output.value}
						</p>
					</div>
				))}
			</div>

			<div className="mt-4 rounded-lg bg-indigo-50 p-4 text-sm leading-6 text-indigo-950 dark:bg-indigo-950/25 dark:text-indigo-100">
				The output is not just a template. It is a stack decision record that an agent, CLI command,
				or developer can follow.
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
			<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
				{icon}
			</span>
			<h3 className="mt-4 text-xl font-black leading-tight">{title}</h3>
			<p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
		</div>
	);
}

function SectionKicker({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
	return (
		<p className="inline-flex items-center gap-2 text-sm font-black uppercase text-indigo-700 dark:text-indigo-300">
			{icon}
			{children}
		</p>
	);
}

function ProofPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-l-2 border-indigo-500 pl-3">
			<p className="text-sm font-black text-zinc-950 dark:text-white">{label}</p>
			<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value}</p>
		</div>
	);
}

function CliLink({
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

function CliSecondaryLink({
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
			className="inline-flex w-full max-w-full items-center justify-center gap-2 rounded-lg border border-indigo-300 bg-transparent px-4 py-2.5 text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-500/10 dark:border-indigo-700 dark:text-indigo-300 sm:w-auto"
		>
			{icon}
			{label}
			<ArrowRight size={15} aria-hidden="true" />
		</Link>
	);
}
