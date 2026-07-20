import * as React from 'react';
import { Link, useParams } from '@tanstack/react-router';
import {
	ArrowRight,
	BookOpen,
	CircleGauge,
	Clock,
	Gauge,
	Layers,
	ListChecks,
	PauseCircle,
	RefreshCcw,
	Rows3,
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
const library = getLibrary('pacer');
const pacerAgentPrompt = [
	'Build a TanStack Pacer timing layer for a TypeScript app.',
	'Use debouncing, throttling, rate limiting, queuing, or batching where each fits the workflow, and expose cancellation, pause/resume, retry, status, and concurrency controls for async work.',
	'Keep the primitives framework-agnostic while wiring reactive state through the correct adapter for the UI runtime.',
].join(' ');

const heroProof = [
	{
		label: 'Noisy input',
		value: 'debounce search, autosave, validation',
	},
	{
		label: 'Fast events',
		value: 'throttle resize, scroll, pointer work',
	},
	{
		label: 'Async pressure',
		value: 'queue, batch, limit, cancel',
	},
];

type PacerSearchResult = {
	label: string;
	query: string;
	result: string;
};

const pacerSearchResults: Array<PacerSearchResult> = [
	{
		label: 'Router',
		query: 'router loader',
		result: 'Router loaders, preload, search params',
	},
	{
		label: 'Virtual',
		query: 'virtual chat',
		result: 'Virtual chat, scrollToEnd, dynamic rows',
	},
	{
		label: 'Table',
		query: 'table filters',
		result: 'Table filters, sorting, column visibility',
	},
];

const featureCards = [
	{
		title: 'Debounce the work that should wait.',
		body: 'Search, validation, autosave, and expensive calculations can wait for intent instead of firing on every keystroke.',
		icon: <Clock size={18} />,
	},
	{
		title: 'Throttle the work that should pace itself.',
		body: 'Scroll, resize, pointer, sensor, and realtime events can stay responsive without flooding the app.',
		icon: <Gauge size={18} />,
	},
	{
		title: 'Queue the work that needs order.',
		body: 'Run async tasks with FIFO, LIFO, priority, pause/resume, cancellation, retries, and concurrency control.',
		icon: <Rows3 size={18} />,
	},
	{
		title: 'Batch the work that should travel together.',
		body: 'Collect writes, logs, telemetry, or cache operations into sensible flushes instead of shipping every item alone.',
		icon: <Split size={18} />,
	},
];

const lifecycleSteps = [
	{
		label: 'Accept',
		body: 'The primitive receives calls from UI events, async workflows, or service boundaries.',
	},
	{
		label: 'Pace',
		body: 'Timing, rate, concurrency, ordering, and batching rules decide when work may run.',
	},
	{
		label: 'Signal',
		body: 'Reactive state reports idle, pending, running, queued, success, error, and cancelled work.',
	},
	{
		label: 'Flush',
		body: 'Manual controls can flush, cancel, pause, resume, retry, or drain the current workload.',
	},
];

const frameworkAdapters = ['React', 'Preact', 'Solid', 'Angular', 'Vanilla'];

export default function PacerLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;

	return (
		<div className="w-full min-w-0 overflow-x-hidden bg-[#f7fee7] text-zinc-950 dark:bg-zinc-950 dark:text-white">
			<section className="max-w-full overflow-hidden border-b border-lime-950/10 bg-[#ecfccb] dark:border-lime-300/10 dark:bg-[#0b1604]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.84fr_1.16fr] lg:items-start lg:py-12 xl:max-w-[92rem]">
					<div className="min-w-0 max-w-full sm:max-w-3xl">
						<SectionKicker icon={<CircleGauge size={14} />}>
							Timing and pressure control
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
							Control when work is allowed to happen.
						</p>

						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Pacer gives JavaScript apps typed primitives for debouncing, throttling, rate
							limiting, queuing, and batching so expensive work runs at the speed the product can
							actually afford.
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
							<PacerLink
								to="/$libraryId/$version/docs"
								params={{ libraryId: library.id, version: resolvedVersion }}
								label="Read the docs"
								icon={<BookOpen size={16} aria-hidden="true" />}
							/>
							<LandingCopyPromptButton prompt={pacerAgentPrompt} label="Copy Pacer Prompt" />
						</div>

						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							{heroProof.map((proof) => (
								<ProofPill key={proof.label} {...proof} />
							))}
						</div>
					</div>

					<PacerPanel />
				</div>
			</section>

			<section className="border-b border-lime-950/10 bg-[#f7fee7] dark:border-lime-300/10 dark:bg-[#0f1b07]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.74fr_1.26fr] xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<WandSparkles size={14} />}>Why Pacer</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Performance problems often start as scheduling problems.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							The app does not need every keypress, scroll tick, resize event, network write, or
							background task to run immediately. Pacer gives each workflow the timing policy it
							deserves.
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
						<SectionKicker icon={<RefreshCcw size={14} />}>Control lifecycle</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Accept the work now. Run it when it makes sense.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Every primitive exposes state and controls, so the product can show pending work,
							cancel stale tasks, flush intentionally, or pause a queue before it becomes
							user-visible chaos.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fbfaf6] dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.82fr_1.18fr] lg:items-start xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<PauseCircle size={14} />}>Async workflows</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Queues should be observable, cancellable, and boring.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Pacer handles sync and async execution, abort controllers, retries, ordering, queue
							state, concurrency, and manual controls without making each feature team invent its
							own scheduler.
						</p>
					</div>

					<AsyncPanel />
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<Layers size={14} />}>Framework adapters</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Core timing primitives, reactive UI adapters.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Use Pacer in plain TypeScript, then connect the same primitives to framework state
							through adapters when the UI needs to react to queue, pending, error, or success
							state.
						</p>
						<div className="mt-5 flex flex-wrap gap-2">
							{frameworkAdapters.map((framework) => (
								<span
									key={framework}
									className="rounded-md border border-lime-200 bg-lime-50 px-3 py-1.5 text-sm font-bold text-lime-800 dark:border-lime-900 dark:bg-lime-950/40 dark:text-lime-200"
								>
									{framework}
								</span>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#f7fee7] py-12 dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
					<div className="max-w-3xl">
						<SectionKicker icon={<ListChecks size={14} />}>Feature surface</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							One timing toolbox instead of scattered timers.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Debounce, throttle, rate limit, queue, batch, flush, cancel, pause, resume, retry,
							prioritize, and control concurrency from one typed set of primitives.
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
							Pacer is built for the messy edges of real app work.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Maintainers, adapters, examples, partners, and GitHub sponsors keep the timing
							primitives grounded in the places apps actually get overwhelmed.
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col gap-14">
					<LandingCommunitySection libraryId="pacer" />
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
				className="border-lime-600 bg-lime-600 text-white hover:bg-lime-700"
			/>
			<Footer />
		</div>
	);
}

function PacerPanel() {
	const timeoutRef = React.useRef<number | null>(null);
	const [inputValue, setInputValue] = React.useState('router loader');
	const [debouncedQuery, setDebouncedQuery] = React.useState('router loader');
	const [inputEvents, setInputEvents] = React.useState(0);
	const [executions, setExecutions] = React.useState(1);
	const [isWaiting, setIsWaiting] = React.useState(false);
	const activeResult =
		pacerSearchResults.find((item) => item.query === debouncedQuery) ??
		pacerSearchResults.find((item) => debouncedQuery.includes(item.label.toLowerCase())) ??
		pacerSearchResults[0];

	React.useEffect(() => {
		if (timeoutRef.current !== null) {
			window.clearTimeout(timeoutRef.current);
		}

		if (inputValue === debouncedQuery) {
			setIsWaiting(false);
			return;
		}

		setIsWaiting(true);
		timeoutRef.current = window.setTimeout(() => {
			setDebouncedQuery(inputValue);
			setExecutions((current) => current + 1);
			setIsWaiting(false);
		}, 650);

		return () => {
			if (timeoutRef.current !== null) {
				window.clearTimeout(timeoutRef.current);
			}
		};
	}, [debouncedQuery, inputValue]);

	const changeInputValue = (nextValue: string) => {
		setInputValue(nextValue);
		setInputEvents((current) => current + 1);
	};

	const flushSearch = () => {
		if (timeoutRef.current !== null) {
			window.clearTimeout(timeoutRef.current);
		}

		if (debouncedQuery !== inputValue) {
			setExecutions((current) => current + 1);
		}

		setDebouncedQuery(inputValue);
		setIsWaiting(false);
	};

	return (
		<div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-lime-200 bg-white p-4 shadow-sm shadow-lime-950/5 dark:border-lime-900 dark:bg-zinc-950">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				</div>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">debounced search</span>
			</div>

			<div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
				<label
					className="text-xs font-black uppercase text-lime-800 dark:text-lime-300"
					htmlFor="pacer-search-demo"
				>
					Search docs
				</label>
				<input
					id="pacer-search-demo"
					className="mt-2 w-full rounded-md border border-lime-200 bg-white px-3 py-2 text-sm font-bold text-zinc-950 outline-none focus:border-lime-500 dark:border-lime-900 dark:bg-zinc-950 dark:text-white"
					value={inputValue}
					onChange={(event) => changeInputValue(event.target.value)}
				/>
				<div className="mt-3 flex flex-wrap gap-2">
					{pacerSearchResults.map((item) => (
						<button
							key={item.query}
							className="rounded-md border border-lime-200 bg-white px-3 py-2 text-xs font-black text-lime-800 transition-colors hover:border-lime-400 dark:border-lime-900 dark:bg-zinc-950 dark:text-lime-200"
							type="button"
							onClick={() => changeInputValue(item.query)}
						>
							{item.label}
						</button>
					))}
					<button
						className="rounded-md border border-lime-600 bg-lime-600 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-lime-700"
						type="button"
						onClick={flushSearch}
					>
						Flush now
					</button>
				</div>
			</div>

			<div className="mt-4 grid gap-3 sm:grid-cols-2">
				{[
					['raw input', inputValue || 'empty'],
					['paced query', debouncedQuery || 'empty'],
					['input events', `${inputEvents}`],
					['executed searches', `${executions}`],
				].map(([label, value]) => (
					<div key={label} className="rounded-lg bg-lime-50 p-3 dark:bg-lime-950/25">
						<p className="text-[0.65rem] font-black uppercase text-lime-800 dark:text-lime-300">
							{label}
						</p>
						<p className="mt-1 text-sm font-black text-lime-950 dark:text-lime-100">{value}</p>
					</div>
				))}
			</div>

			<div className="mt-4 rounded-lg bg-lime-50 p-4 dark:bg-lime-950/25">
				<div className="flex items-center justify-between gap-3">
					<p className="text-xs font-black uppercase text-lime-800 dark:text-lime-300">
						{isWaiting ? 'waiting 650ms' : 'result'}
					</p>
					<span className="rounded-md bg-white px-2 py-1 text-[0.65rem] font-black uppercase text-lime-800 dark:bg-zinc-950 dark:text-lime-200">
						debounce
					</span>
				</div>
				<p className="mt-2 text-sm font-black text-lime-950 dark:text-lime-100">
					{activeResult?.result ?? 'No matching docs yet'}
				</p>
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
					className="rounded-lg border border-zinc-200 bg-[#f7fee7] p-4 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime-100 text-sm font-black text-lime-800 dark:bg-lime-950 dark:text-lime-200">
						{index + 1}
					</span>
					<h3 className="mt-4 text-lg font-black leading-tight">{step.label}</h3>
					<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{step.body}</p>
				</div>
			))}
		</div>
	);
}

function AsyncPanel() {
	return (
		<div className="min-w-0 rounded-lg border border-lime-200 bg-white p-4 dark:border-lime-900 dark:bg-zinc-950">
			<div className="rounded-lg bg-zinc-950 p-4 text-sm text-lime-100 dark:bg-black">
				<p className="font-mono leading-6">
					const queue = new AsyncQueuer(uploadFile, {'{'} concurrency: 3 {'}'})
					<br />
					queue.addItem(file)
					<br />
					queue.store.subscribe(state =&gt; syncStatus(state.status))
				</p>
			</div>

			<div className="mt-4 grid gap-3 md:grid-cols-2">
				{[
					['pause/resume', 'stop the queue without losing work'],
					['abort', 'cancel stale async tasks cleanly'],
					['retry', 'recover transient failures'],
					['flush', 'run the pending batch intentionally'],
				].map(([label, body]) => (
					<div
						key={label}
						className="rounded-lg border border-zinc-200 bg-[#f7fee7] p-4 dark:border-zinc-800 dark:bg-zinc-900"
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
			<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-200">
				{icon}
			</span>
			<h3 className="mt-4 text-xl font-black leading-tight">{title}</h3>
			<p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
		</div>
	);
}

function SectionKicker({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
	return (
		<p className="inline-flex items-center gap-2 text-sm font-black uppercase text-lime-700 dark:text-lime-300">
			{icon}
			{children}
		</p>
	);
}

function ProofPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-l-2 border-lime-500 pl-3">
			<p className="text-sm font-black text-zinc-950 dark:text-white">{label}</p>
			<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value}</p>
		</div>
	);
}

function PacerLink({
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
