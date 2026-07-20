import * as React from 'react';
import { Link, useParams } from '@tanstack/react-router';
import {
	ArrowRight,
	BookOpen,
	GitBranch,
	Hourglass,
	Network,
	PlayCircle,
	RotateCcw,
	ScanSearch,
	ShieldCheck,
	Sparkles,
	Workflow,
} from 'lucide-react';

import { BottomCTA } from '~/components/BottomCTA';
import { Footer } from '~/components/Footer';
import { GithubIcon } from '~/components/icons/GithubIcon';
import LandingPageGad from '~/components/LandingPageGad';
import { LandingCommunitySection } from '~/components/LandingCommunitySection';
import { SponsorSection } from '~/components/SponsorSection';
import { LibraryDownloadsMicro } from '~/components/LibraryDownloadsMicro';
import { LibraryWordmark } from '~/components/LibraryWordmark';
import { getLibrary } from '~/libraries';

import { LandingCopyPromptButton } from '~/components/landing/LandingCopyPromptButton';
const library = getLibrary('workflow');
const workflowAgentPrompt = [
	'Build a TanStack Workflow process for a TypeScript app.',
	'Model a multi-step workflow with typed inputs and outputs, retries, backoff, approvals, fan-out, and inspectable execution history.',
	'Keep business process state explicit, and verify concrete API calls against the current Workflow docs before implementation.',
].join(' ');

const heroProof = [
	{
		label: 'Typed graph',
		value: 'inputs, outputs, context, transitions',
	},
	{
		label: 'Run state',
		value: 'history, attempts, next actions',
	},
	{
		label: 'Recovery',
		value: 'retries, backoff, approvals, inspection',
	},
];

const timelineRows = [
	{
		step: 'validate order',
		state: 'done',
		detail: 'typed payload accepted',
	},
	{
		step: 'reserve inventory',
		state: 'retrying',
		detail: 'backoff 30s',
	},
	{
		step: 'manager approval',
		state: 'waiting',
		detail: 'human gate',
	},
	{
		step: 'fan-out fulfillment',
		state: 'queued',
		detail: '3 regions',
	},
];

const featureCards = [
	{
		title: 'Business processes become typed graphs.',
		body: 'Inputs, outputs, shared context, branching, and step boundaries stay modeled in TypeScript instead of being implied by background job glue.',
		icon: <GitBranch size={18} />,
	},
	{
		title: 'State is part of the model.',
		body: 'Long-running work needs visible run state around slow systems, retries, human delays, and the next action the process is waiting on.',
		icon: <ShieldCheck size={18} />,
	},
	{
		title: 'Retries live next to the work.',
		body: 'Backoff, recovery, compensation, and error handling stay close to the step that can fail, where maintainers can reason about it.',
		icon: <RotateCcw size={18} />,
	},
	{
		title: 'Workflow state is meant to be inspected.',
		body: 'A process that matters needs visible history, status, inputs, outputs, and next actions, not a hidden promise chain.',
		icon: <ScanSearch size={18} />,
	},
];

const lifecycleSteps = [
	{
		label: 'Start',
		body: 'A typed workflow run begins with a known input and initial context.',
	},
	{
		label: 'Step',
		body: 'Each step owns its input, output, retry policy, and side effects.',
	},
	{
		label: 'Wait',
		body: 'The run can pause around external systems, timers, or approvals.',
	},
	{
		label: 'Resume',
		body: 'Execution continues with history and state intact after interruptions.',
	},
];

const observabilityItems = [
	{
		label: 'run id',
		value: 'order-4832',
	},
	{
		label: 'current step',
		value: 'reserve inventory',
	},
	{
		label: 'attempt',
		value: '2 of 5',
	},
	{
		label: 'next action',
		value: 'wait for approval',
	},
];

export default function WorkflowLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;

	return (
		<div className="w-full min-w-0 overflow-x-hidden bg-[#eff6ff] text-zinc-950 dark:bg-zinc-950 dark:text-white">
			<section className="max-w-full overflow-hidden border-b border-blue-950/10 bg-[#dbeafe] dark:border-blue-300/10 dark:bg-[#061325]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.84fr_1.16fr] lg:items-start lg:py-12 xl:max-w-[92rem]">
					<div className="min-w-0 max-w-full sm:max-w-3xl">
						<SectionKicker icon={<Workflow size={14} />}>Durable typed processes</SectionKicker>

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
							Put long-running business work in a model you can trust.
						</p>

						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Workflow is for modeling approvals, retries, fan-out, slow external systems, and
							visible run state as TypeScript workflows instead of one-off background jobs scattered
							across the app.
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
							<WorkflowLink
								to="/$libraryId/$version/docs"
								params={{ libraryId: library.id, version: resolvedVersion }}
								label="Read the docs"
								icon={<BookOpen size={16} aria-hidden="true" />}
							/>
							<LandingCopyPromptButton prompt={workflowAgentPrompt} label="Copy Workflow Prompt" />
						</div>

						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							{heroProof.map((proof) => (
								<ProofPill key={proof.label} {...proof} />
							))}
						</div>
					</div>

					<WorkflowRunPanel />
				</div>
			</section>

			<section className="border-b border-blue-950/10 bg-[#f4f8ff] dark:border-blue-300/10 dark:bg-[#07182d]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.74fr_1.26fr] xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Sparkles size={14} />}>Why Workflow</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Background jobs become business systems eventually.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							If a process needs retries, approvals, multiple services, human waiting time, and
							trusted state, it deserves a workflow model instead of another hidden async function.
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
						<SectionKicker icon={<PlayCircle size={14} />}>Execution model</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Start, step, wait, resume.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Typed workflows let process state move through time deliberately instead of hoping a
							single request or queue worker keeps everything together.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fbfaf6] dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.82fr_1.18fr] lg:items-start xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Hourglass size={14} />}>Observable process state</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							If the business cares, the runtime should show it.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Runs need IDs, inputs, history, attempts, waiting reasons, and next actions so
							operators and developers can tell what happened and what comes next.
						</p>
					</div>

					<ObservabilityPanel />
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<Network size={14} />}>Typed orchestration</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							The workflow graph is application code.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Keep the process definition close to the TypeScript app, with step-level types and
							explicit recovery behavior.
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
							Workflow is for the parts of apps that cannot be hand-waved.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Maintainers, examples, partners, and GitHub sponsors keep the orchestration model
							close to real long-running product work.
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col gap-14">
					<LandingCommunitySection libraryId="workflow" />
					<SponsorSection title="GitHub Sponsors" aspectRatio="1/1" packMaxWidth="900px" showCTA />
				</div>
			</section>

			<LandingPageGad />
			<BottomCTA
				linkProps={{
					to: '/$libraryId/$version/docs',
					params: { libraryId: library.id, version: resolvedVersion },
				}}
				label="Explore Workflow"
				className="border-blue-800 bg-blue-800 text-white hover:bg-blue-900"
			/>
			<Footer />
		</div>
	);
}

function WorkflowRunPanel() {
	const [activeStepIndex, setActiveStepIndex] = React.useState(1);
	const [retryCount, setRetryCount] = React.useState(1);
	const displayedRows = timelineRows.map((row, index) => {
		if (index < activeStepIndex) {
			return { ...row, state: 'done' };
		}

		if (index === activeStepIndex) {
			return {
				...row,
				detail: row.step === 'reserve inventory' ? `backoff ${retryCount * 15}s` : row.detail,
				state: row.step === 'manager approval' ? 'waiting' : 'running',
			};
		}

		return { ...row, state: 'queued' };
	});

	return (
		<div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-blue-200 bg-white p-4 shadow-sm shadow-blue-950/5 dark:border-blue-900 dark:bg-zinc-950">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				</div>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">order workflow</span>
			</div>

			<div className="mt-4 flex flex-wrap gap-2">
				<button
					className="rounded-md border border-blue-600 bg-blue-600 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-blue-700"
					type="button"
					onClick={() =>
						setActiveStepIndex((current) => (current >= timelineRows.length - 1 ? 0 : current + 1))
					}
				>
					Advance
				</button>
				<button
					className="rounded-md border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-800 transition-colors hover:border-blue-400 dark:border-blue-900 dark:bg-zinc-950 dark:text-blue-200"
					type="button"
					onClick={() => setRetryCount((current) => current + 1)}
				>
					Retry step
				</button>
				<button
					className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-700 transition-colors hover:border-blue-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
					type="button"
					onClick={() => {
						setActiveStepIndex(0);
						setRetryCount(1);
					}}
				>
					Restart
				</button>
			</div>

			<div className="mt-4 space-y-3">
				{displayedRows.map((row, index) => (
					<div
						key={row.step}
						className="grid gap-3 rounded-lg border border-zinc-200 bg-blue-50 p-3 dark:border-zinc-800 dark:bg-blue-950/20 sm:grid-cols-[auto_1fr_auto] sm:items-center"
					>
						<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-sm font-black text-blue-900 dark:bg-blue-950 dark:text-blue-200">
							{index + 1}
						</span>
						<div>
							<p className="font-black">{row.step}</p>
							<p className="mt-1 text-xs font-bold text-zinc-600 dark:text-zinc-400">
								{row.detail}
							</p>
						</div>
						<span className="rounded-md bg-white px-2 py-1 text-[0.65rem] font-black uppercase text-blue-900 dark:bg-zinc-950 dark:text-blue-200">
							{row.state}
						</span>
					</div>
				))}
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
					className="rounded-lg border border-zinc-200 bg-[#eff6ff] p-4 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-sm font-black text-blue-900 dark:bg-blue-950 dark:text-blue-200">
						{index + 1}
					</span>
					<h3 className="mt-4 text-lg font-black leading-tight">{step.label}</h3>
					<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{step.body}</p>
				</div>
			))}
		</div>
	);
}

function ObservabilityPanel() {
	return (
		<div className="min-w-0 rounded-lg border border-blue-200 bg-white p-4 dark:border-blue-900 dark:bg-zinc-950">
			<div className="grid gap-3 md:grid-cols-2">
				{observabilityItems.map((item) => (
					<div
						key={item.label}
						className="rounded-lg border border-zinc-200 bg-[#f4f8ff] p-4 dark:border-zinc-800 dark:bg-zinc-900"
					>
						<p className="text-[0.65rem] font-black uppercase text-zinc-500 dark:text-zinc-400">
							{item.label}
						</p>
						<p className="mt-2 text-sm font-bold leading-6 text-zinc-950 dark:text-white">
							{item.value}
						</p>
					</div>
				))}
			</div>

			<div className="mt-4 rounded-lg bg-zinc-950 p-4 text-sm text-blue-100 dark:bg-black">
				<p className="font-mono leading-6">
					step: &quot;reserve inventory&quot;
					<br />
					attempts: 2 / 5
					<br />
					next: &quot;manager approval&quot;
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
			<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200">
				{icon}
			</span>
			<h3 className="mt-4 text-xl font-black leading-tight">{title}</h3>
			<p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
		</div>
	);
}

function SectionKicker({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
	return (
		<p className="inline-flex items-center gap-2 text-sm font-black uppercase text-blue-800 dark:text-blue-300">
			{icon}
			{children}
		</p>
	);
}

function ProofPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-l-2 border-blue-600 pl-3">
			<p className="text-sm font-black text-zinc-950 dark:text-white">{label}</p>
			<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value}</p>
		</div>
	);
}

function WorkflowLink({
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
