import * as React from 'react';
import { Link, useParams } from '@tanstack/react-router';
import {
	ArrowDownToLine,
	ArrowRight,
	BookOpen,
	BoxSelect,
	Eye,
	Gauge,
	Grid3X3,
	History,
	List,
	MessageSquareText,
	MoveHorizontal,
	MousePointer2,
	Pause,
	Play,
	Ruler,
	Scaling,
	Send,
	Sparkles,
	StretchHorizontal,
	Timer,
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
import { getLibrary } from '~/libraries';
import { virtualProject } from '~/libraries/virtual';
import { LandingCodeExampleCard } from '~/components/landing/LandingCodeExampleCard';
import { virtualCodeExample } from '~/components/landing/codeExamples';
import { usePrefersReducedMotion } from '~/utils/usePrefersReducedMotion';

import { LandingEcosystemProof } from '~/components/landing/LandingEcosystemProof';
import { LandingCopyPromptButton } from '~/components/landing/LandingCopyPromptButton';
const library = getLibrary('virtual');
const virtualAgentPrompt = [
	'Build a TanStack Virtual experience for a TypeScript app.',
	'Use a headless virtualizer for a large list or grid, render only visible items plus overscan, support dynamic measurement where rows can change size, and keep the scroll container/markup owned by the product UI.',
	'Include smooth scrolling, sticky affordances where useful, and clear empty/loading states without replacing the app design system.',
].join(' ');

const heroProof = [
	{
		label: 'Visible window',
		value: 'render the viewport, not the dataset',
	},
	{
		label: 'Measured sizing',
		value: 'fixed, variable, dynamic rows',
	},
	{
		label: 'Headless scroll',
		value: 'own the container, markup, and styles',
	},
];

const virtualDemoRows = Array.from({ length: 34 }, (_, index) => ({
	label: `Row ${index + 180}`,
	height: [34, 52, 42, 66, 38, 58, 46, 74, 40][index % 9],
}));

const featureCards = [
	{
		title: 'The DOM stays small while the list stays huge.',
		body: 'Virtual calculates the visible range, pads the scroll space, and lets you render only the items the user can actually see.',
		icon: <Eye size={18} />,
	},
	{
		title: 'Measurement handles real content.',
		body: 'Use fixed sizes when you can, measured dynamic sizes when content varies, and overscan to keep fast scrolling smooth.',
		icon: <Ruler size={18} />,
	},
	{
		title: 'Scroll containers stay product-owned.',
		body: 'Window scrolling, element scrolling, grids, lanes, sticky UI, and custom markup remain your responsibility and your freedom.',
		icon: <MousePointer2 size={18} />,
	},
	{
		title: 'It composes with the rest of the stack.',
		body: 'Pair Virtual with Table for giant grids, Query for paged data, Router for URL state, or your own renderer for anything else.',
		icon: <Sparkles size={18} />,
	},
];

const pipelineSteps = [
	{
		label: 'Count',
		body: 'Tell the virtualizer how many things exist, even if most of them are not mounted.',
	},
	{
		label: 'Estimate',
		body: 'Start from a stable size estimate so the scroll range is known immediately.',
	},
	{
		label: 'Measure',
		body: 'Let dynamic items report real sizes as content loads or expands.',
	},
	{
		label: 'Render',
		body: 'Map virtual items to your own absolutely positioned rows, cells, or cards.',
	},
];

const virtualModes = [
	{
		title: 'Vertical lists',
		body: 'Feeds, menus, logs, timelines, search results, and long admin indexes.',
		icon: <List size={18} />,
	},
	{
		title: 'Horizontal lanes',
		body: 'Calendars, kanban lanes, timelines, image strips, and dense inspectors.',
		icon: <MoveHorizontal size={18} />,
	},
	{
		title: 'Grid surfaces',
		body: 'Rows and columns that need windowing without adopting a canned grid UI.',
		icon: <Grid3X3 size={18} />,
	},
];

type VirtualAlign = 'start' | 'center' | 'end';

type VirtualScrollAction =
	| {
			align: VirtualAlign;
			code: string;
			detail: string;
			index: number;
			kind: 'index';
			label: string;
	  }
	| {
			code: string;
			detail: string;
			kind: 'offset';
			label: string;
			offset: number;
	  }
	| {
			code: string;
			detail: string;
			kind: 'end';
			label: string;
	  };

const virtualScrollActions: Array<VirtualScrollAction> = [
	{
		kind: 'index',
		label: 'Row 180',
		detail: 'start align',
		code: 'virtualizer.scrollToIndex(180)',
		index: 0,
		align: 'start',
	},
	{
		kind: 'index',
		label: 'Row 198',
		detail: 'center align',
		code: "virtualizer.scrollToIndex(198, { align: 'center' })",
		index: 18,
		align: 'center',
	},
	{
		kind: 'offset',
		label: 'Offset 640',
		detail: 'pixel scroll',
		code: 'virtualizer.scrollToOffset(640)',
		offset: 640,
	},
	{
		kind: 'end',
		label: 'End',
		detail: 'latest edge',
		code: 'virtualizer.scrollToEnd()',
	},
];

type VirtualChatRole = 'assistant' | 'tool' | 'user';

type VirtualChatMessage = {
	body: string;
	id: string;
	role: VirtualChatRole;
	status?: string;
};

type VirtualChatAnchor = {
	id: string;
	offset: number;
};

const initialChatMessages: Array<VirtualChatMessage> = [
	{
		id: 'm-07',
		role: 'user',
		body: 'Can you summarize the alerts from the last deploy?',
	},
	{
		id: 'm-08',
		role: 'assistant',
		body: 'Three services reported higher latency, but only search crossed the user-visible threshold. I would start with the cache miss spike at 14:42.',
	},
	{
		id: 'm-09',
		role: 'tool',
		body: 'query deploy_events --service search --window 30m',
		status: 'tool result',
	},
	{
		id: 'm-10',
		role: 'assistant',
		body: 'The slow requests line up with a schema warmup path. The good news: the regression is isolated and the route recovered after the cache filled.',
	},
	{
		id: 'm-11',
		role: 'user',
		body: 'Draft the follow-up for the incident channel.',
	},
	{
		id: 'm-12',
		role: 'assistant',
		body: 'Posted a concise update: cause, impact window, current status, and one owner for the follow-up patch.',
	},
];

const olderChatMessages: Array<VirtualChatMessage> = [
	{
		id: 'm-01',
		role: 'user',
		body: 'Start a deploy review and keep the message list pinned unless I scroll away.',
	},
	{
		id: 'm-02',
		role: 'assistant',
		body: 'I will keep the latest turn visible while new output streams, and preserve this exact reading position if older history loads above it.',
	},
	{
		id: 'm-03',
		role: 'tool',
		body: 'fetch traces --cursor before:m-07 --limit 50',
		status: 'prepended',
	},
	{
		id: 'm-04',
		role: 'assistant',
		body: 'Older context loaded without shifting the visible message. That is the part chat UIs usually end up rebuilding by hand.',
	},
	{
		id: 'm-05',
		role: 'user',
		body: 'Keep going if the model response grows.',
	},
	{
		id: 'm-06',
		role: 'assistant',
		body: 'Streaming output can resize the last row over and over while the viewport stays anchored to the end.',
	},
];

const chatStreamChunks = [
	'Virtual treats chat as an end-anchored list.',
	'Older history can be prepended while the current message keeps its visual position.',
	'When the user is already at the latest message, appended tokens keep following the end.',
	'If the user scrolls up to read, new output lands below without stealing the viewport.',
];

const frameworkAdapters = ['React', 'Vue', 'Solid', 'Svelte', 'Lit', 'Angular'];

export default function VirtualLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;

	return (
		<div className="w-full min-w-0 overflow-x-hidden bg-[#fbf7ff] text-zinc-950 dark:bg-zinc-950 dark:text-white">
			<section className="max-w-full overflow-hidden border-b border-purple-950/10 bg-[#f8f0ff] dark:border-purple-300/10 dark:bg-[#120818]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.84fr_1.16fr] lg:items-start lg:py-12 xl:max-w-[92rem]">
					<div className="min-w-0 max-w-full sm:max-w-3xl">
						<SectionKicker icon={<StretchHorizontal size={14} />}>
							Headless virtualization
						</SectionKicker>

						<h1 className="mt-4 text-5xl font-black leading-[0.95] sm:text-6xl lg:text-7xl">
							<LibraryWordmark library={library} />
						</h1>

						<p className="mt-5 max-w-2xl text-lg font-bold leading-8 text-zinc-900 dark:text-zinc-100 sm:text-xl">
							Massive scroll surfaces without massive DOM.
						</p>

						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Virtual calculates the visible window for long lists, grids, and scroll containers so
							your app can keep the markup, layout, and design while rendering only the work the
							user can see.
						</p>

						<LibraryDownloadsMicro
							animateIncreaseTrend
							library={library}
							className="mt-5"
							label="weekly downloads"
							period="weekly"
							showTotals
						/>

						<p className="mt-4 max-w-xl border-l-2 border-purple-500 pl-3 text-sm font-black text-purple-800 dark:text-purple-200">
							The most popular and most used virtualization engine for modern web apps.
						</p>

						<div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
							<VirtualLink
								to="/$libraryId/$version/docs"
								params={{ libraryId: library.id, version: resolvedVersion }}
								label="Read the docs"
								icon={<BookOpen size={16} aria-hidden="true" />}
							/>
							<LandingCopyPromptButton prompt={virtualAgentPrompt} label="Copy Virtual Prompt" />
						</div>

						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							{heroProof.map((proof) => (
								<ProofPill key={proof.label} {...proof} />
							))}
						</div>
						<LandingEcosystemProof />
					</div>

					<VirtualWindowPanel />
				</div>
			</section>

			<section className="border-b border-purple-950/10 bg-[#fcf8ff] dark:border-purple-300/10 dark:bg-[#160b1d]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.74fr_1.26fr] xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Gauge size={14} />}>Why Virtual</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Performance is a layout problem before it is a rendering problem.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Virtualization is not just fewer nodes. It is scroll math, measurement, overscan,
							dynamic content, and container ownership. Virtual gives you those primitives without
							forcing a visual component on top.
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
						<SectionKicker icon={<Timer size={14} />}>Virtualizer lifecycle</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Keep the scroll range honest while the DOM stays lean.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Estimate first, measure when needed, then render virtual items into your own row,
							card, cell, or lane components. The API is small because the layout remains yours.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#f4fbff] dark:border-zinc-800 dark:bg-[#071016]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.76fr_1.24fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<MessageSquareText size={14} />}>
							AI chat virtualization
						</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Chat scroll is backwards, streaming, and constantly resizing.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Chat, agents, copilots, logs, and support inboxes need end anchoring, stable prepends,
							append-follow, and a reliable way to jump back to the latest turn. Virtual now models
							those behaviors as scroll primitives instead of app-specific bookkeeping.
						</p>
						<div className="mt-5 grid gap-3 sm:grid-cols-2">
							{[
								['anchorTo', "'end' keeps the latest edge stable"],
								['followOnAppend', 'follow only when already pinned'],
								['scrollToEnd', 'wire a Latest control to the API'],
								['measureElement', 'let streamed bubbles grow naturally'],
							].map(([label, value]) => (
								<div key={label} className="border-l-2 border-sky-500 pl-3">
									<p className="font-mono text-sm font-black text-sky-800 dark:text-sky-200">
										{label}
									</p>
									<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value}</p>
								</div>
							))}
						</div>
					</div>

					<VirtualChatPanel />
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fbfaf6] dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.82fr_1.18fr] lg:items-start xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<BoxSelect size={14} />}>Scroll surfaces</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Lists, lanes, and grids all share the same windowing idea.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							A virtualizer is a calculation layer. Whether the output becomes a vertical feed, a
							horizontal timeline, or a two-dimensional grid, the product keeps control of the
							actual experience.
						</p>
					</div>

					<ModePanel />
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<Scaling size={14} />}>Framework adapters</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							The same virtual math across UI runtimes.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Use the adapter that fits your framework, or work from the core. The virtual range,
							measurements, and scroll behavior stay focused on the data and container instead of
							the renderer.
						</p>
						<div className="mt-5 flex flex-wrap gap-2">
							{frameworkAdapters.map((framework) => (
								<span
									key={framework}
									className="rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-bold text-purple-800 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-200"
								>
									{framework}
								</span>
							))}
						</div>
					</div>

					<div className="min-w-0 max-w-full overflow-hidden">
						<LandingCodeExampleCard example={virtualCodeExample} />
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fbf7ff] py-12 dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
					<div className="max-w-3xl">
						<SectionKicker icon={<Gauge size={14} />}>Field notes</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Smooth scrolling is table stakes. Owning the surface is the point.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							The existing copy had the right spirit: a tiny API for vertical, horizontal, and
							grid-style virtualization, with all the design control left in your hands.
						</p>
					</div>
				</div>

				<div className="mt-8">
					<LibraryTestimonials testimonials={virtualProject.testimonials} />
				</div>
			</section>

			<section className="bg-white py-12 dark:bg-zinc-950">
				<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
					<div className="max-w-3xl">
						<SectionKicker icon={<GithubIcon className="h-4 w-4" />}>
							Open source ecosystem
						</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Virtual is small because the community keeps it sharp.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Maintainers, adapters, examples, partners, and GitHub sponsors keep the virtualization
							core close to real scrolling problems.
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col gap-14">
					<LandingCommunitySection libraryId="virtual" />
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
				className="border-purple-500 bg-purple-500 text-white hover:bg-purple-600"
			/>
			<Footer />
		</div>
	);
}

function VirtualWindowPanel() {
	const prefersReducedMotion = usePrefersReducedMotion();
	const scrollContainerRef = React.useRef<HTMLDivElement>(null);
	const scrollOffsetRef = React.useRef(0);
	const isProgrammaticScrollRef = React.useRef(false);
	const programmaticScrollResetRef = React.useRef<number | null>(null);
	const [scrollOffset, setScrollOffset] = React.useState(0);
	const [isAutoScrolling, setIsAutoScrolling] = React.useState(false);
	const [lastScrollOperation, setLastScrollOperation] = React.useState(
		virtualScrollActions[0]?.code ?? 'virtualizer.scrollToIndex(180)',
	);
	const viewportHeight = 320;
	const overscan = 96;
	const measurements = React.useMemo(() => {
		let start = 0;

		return virtualDemoRows.map((row) => {
			const measurement = {
				...row,
				start,
				end: start + row.height,
			};

			start += row.height + 8;

			return measurement;
		});
	}, []);
	const totalSize = measurements[measurements.length - 1]?.end ?? 0;
	const maxOffset = Math.max(totalSize - viewportHeight, 0);
	const activeStart = scrollOffset;
	const activeEnd = scrollOffset + viewportHeight;
	const mountedRows = measurements.filter(
		(row) => row.end >= activeStart - overscan && row.start <= activeEnd + overscan,
	);
	const activeRows = mountedRows.filter((row) => row.end >= activeStart && row.start <= activeEnd);
	const isRowMounted = (row: { end: number; start: number }) =>
		row.end >= activeStart - overscan && row.start <= activeEnd + overscan;
	const isRowVisible = (row: { end: number; start: number }) =>
		row.end >= activeStart && row.start <= activeEnd;

	React.useEffect(() => {
		scrollOffsetRef.current = scrollOffset;
	}, [scrollOffset]);

	React.useEffect(() => {
		if (prefersReducedMotion === false) {
			setIsAutoScrolling(true);
		}
	}, [prefersReducedMotion]);

	React.useEffect(() => {
		return () => {
			if (programmaticScrollResetRef.current !== null) {
				window.clearTimeout(programmaticScrollResetRef.current);
			}
		};
	}, []);

	React.useEffect(() => {
		if (!isAutoScrolling || prefersReducedMotion) {
			return;
		}

		const scrollElement = scrollContainerRef.current;

		if (!scrollElement) {
			return;
		}

		let frameId = 0;
		let startTime: number | null = null;
		const duration = 6800;
		const startingPhase = maxOffset > 0 ? scrollOffsetRef.current / maxOffset : 0;

		const update = (time: number) => {
			if (startTime === null) {
				startTime = time - startingPhase * duration;
			}

			const phase = ((time - startTime) % duration) / duration;
			const eased = 0.5 - Math.cos(phase * Math.PI * 2) / 2;
			const nextOffset = eased * maxOffset;

			isProgrammaticScrollRef.current = true;
			scrollElement.scrollTop = nextOffset;
			setScrollOffset(nextOffset);

			if (programmaticScrollResetRef.current !== null) {
				window.clearTimeout(programmaticScrollResetRef.current);
			}

			programmaticScrollResetRef.current = window.setTimeout(() => {
				isProgrammaticScrollRef.current = false;
			}, 40);
			frameId = window.requestAnimationFrame(update);
		};

		frameId = window.requestAnimationFrame(update);

		return () => window.cancelAnimationFrame(frameId);
	}, [isAutoScrolling, maxOffset, prefersReducedMotion]);

	const markProgrammaticScroll = (resetDelay: number) => {
		isProgrammaticScrollRef.current = true;

		if (programmaticScrollResetRef.current !== null) {
			window.clearTimeout(programmaticScrollResetRef.current);
		}

		programmaticScrollResetRef.current = window.setTimeout(() => {
			isProgrammaticScrollRef.current = false;
		}, resetDelay);
	};

	const scrollToVirtualOffset = (nextOffset: number, operation: string) => {
		const scrollElement = scrollContainerRef.current;
		const clampedOffset = Math.max(0, Math.min(nextOffset, maxOffset));

		setIsAutoScrolling(false);
		setLastScrollOperation(operation);

		if (!scrollElement) {
			setScrollOffset(clampedOffset);
			return;
		}

		const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

		if (behavior === 'auto') {
			setScrollOffset(clampedOffset);
		}

		markProgrammaticScroll(prefersReducedMotion ? 80 : 460);
		scrollElement.scrollTo({ top: clampedOffset, behavior });
	};

	const getIndexOffset = (index: number, align: VirtualAlign) => {
		const measurement = measurements[index];

		if (!measurement) {
			return 0;
		}

		if (align === 'center') {
			return measurement.start - viewportHeight / 2 + measurement.height / 2;
		}

		if (align === 'end') {
			return measurement.end - viewportHeight;
		}

		return measurement.start;
	};

	const runScrollAction = (action: VirtualScrollAction) => {
		if (action.kind === 'index') {
			scrollToVirtualOffset(getIndexOffset(action.index, action.align), action.code);
			return;
		}

		if (action.kind === 'offset') {
			scrollToVirtualOffset(action.offset, action.code);
			return;
		}

		scrollToVirtualOffset(maxOffset, action.code);
	};

	const pauseAutoScroll = () => {
		if (isAutoScrolling) {
			setIsAutoScrolling(false);
		}
	};

	return (
		<div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-purple-200 bg-white p-4 shadow-sm shadow-purple-950/5 dark:border-purple-900 dark:bg-zinc-950">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				</div>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
					10,000 rows / {mountedRows.length} mounted / {activeRows.length} visible
				</span>
			</div>

			<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2 rounded-lg bg-purple-50 px-3 py-2 dark:bg-purple-950/25">
					<span
						className={
							isAutoScrolling
								? 'h-2 w-2 rounded-full bg-emerald-500'
								: 'h-2 w-2 rounded-full bg-zinc-400'
						}
					/>
					<span className="text-xs font-black uppercase text-purple-800 dark:text-purple-200">
						{isAutoScrolling ? 'Auto loop' : 'Manual'}
					</span>
				</div>
				<button
					className="inline-flex items-center gap-2 rounded-md border border-purple-200 bg-white px-3 py-2 text-xs font-black text-purple-800 transition-colors hover:border-purple-400 hover:bg-purple-50 dark:border-purple-900 dark:bg-zinc-950 dark:text-purple-200 dark:hover:border-purple-600 dark:hover:bg-purple-950/25"
					type="button"
					onClick={() => setIsAutoScrolling((current) => !current)}
				>
					{isAutoScrolling ? (
						<Pause aria-hidden="true" size={14} />
					) : (
						<Play aria-hidden="true" size={14} />
					)}
					{isAutoScrolling ? 'Pause' : 'Resume'}
				</button>
			</div>

			<div className="mt-4 rounded-lg border border-purple-100 bg-purple-50/70 p-3 dark:border-purple-900 dark:bg-purple-950/20">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="text-xs font-black uppercase text-purple-800 dark:text-purple-200">
						scroll API
					</p>
					<code className="max-w-full truncate rounded bg-white px-2 py-1 font-mono text-[0.68rem] font-bold text-purple-800 dark:bg-zinc-950 dark:text-purple-200">
						{lastScrollOperation}
					</code>
				</div>
				<div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
					{virtualScrollActions.map((action) => {
						const isActive = lastScrollOperation === action.code;

						return (
							<button
								key={action.code}
								aria-pressed={isActive}
								className={
									isActive
										? 'rounded-md border border-purple-500 bg-purple-500 px-3 py-2 text-left text-white shadow-sm shadow-purple-950/15'
										: 'rounded-md border border-purple-200 bg-white px-3 py-2 text-left text-purple-900 transition-colors hover:border-purple-400 hover:bg-purple-100 dark:border-purple-900 dark:bg-zinc-950 dark:text-purple-100 dark:hover:border-purple-600 dark:hover:bg-purple-950/30'
								}
								type="button"
								onClick={() => runScrollAction(action)}
							>
								<span className="flex items-center justify-between gap-2 text-xs font-black">
									{action.label}
									<ArrowRight aria-hidden="true" size={13} />
								</span>
								<span
									className={
										isActive
											? 'mt-1 block text-[0.65rem] font-bold uppercase text-white/75'
											: 'mt-1 block text-[0.65rem] font-bold uppercase text-purple-600 dark:text-purple-300'
									}
								>
									{action.detail}
								</span>
							</button>
						);
					})}
				</div>
			</div>

			<div className="mt-4 grid gap-3 lg:grid-cols-[0.68fr_1.32fr]">
				<div className="rounded-lg bg-purple-50 p-3 dark:bg-purple-950/25">
					<p className="text-xs font-black uppercase text-purple-800 dark:text-purple-200">range</p>
					<div className="mt-3 h-80 overflow-hidden rounded-md bg-white p-2 dark:bg-zinc-950">
						<div className="relative h-full overflow-hidden rounded-md bg-zinc-200 dark:bg-zinc-800">
							<div
								className="absolute left-2 right-2 z-10 rounded-md border-2 border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-950/20"
								style={{
									height: `${(viewportHeight / totalSize) * 100}%`,
									top: `${(scrollOffset / totalSize) * 100}%`,
								}}
							/>
							{measurements.map((row) => {
								const rowMounted = isRowMounted(row);
								const rowVisible = isRowVisible(row);

								return (
									<div
										key={row.label}
										className={
											rowVisible
												? 'absolute left-4 right-4 rounded bg-purple-400/90 shadow-sm shadow-purple-950/30 dark:bg-purple-300/90'
												: rowMounted
													? 'absolute left-4 right-4 rounded bg-zinc-400/40 dark:bg-zinc-600/70'
													: 'absolute left-4 right-4 rounded bg-zinc-400/12 dark:bg-zinc-700/25'
										}
										style={{
											height: Math.max(3, Math.min(9, row.height / 8)),
											top: `${(row.start / totalSize) * 100}%`,
										}}
									/>
								);
							})}
						</div>
					</div>
				</div>

				<div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
					<div
						ref={scrollContainerRef}
						aria-label="Virtualized rows"
						className="relative overflow-y-auto rounded-md bg-white dark:bg-zinc-950"
						role="region"
						style={{ height: viewportHeight }}
						onScroll={(event) => {
							setScrollOffset(event.currentTarget.scrollTop);

							if (isProgrammaticScrollRef.current) {
								isProgrammaticScrollRef.current = false;
								return;
							}

							setIsAutoScrolling(false);
						}}
						onMouseDown={pauseAutoScroll}
						onTouchStart={pauseAutoScroll}
						onWheel={pauseAutoScroll}
					>
						<div className="relative w-full" style={{ height: totalSize }}>
							{mountedRows.map((row) => {
								const rowVisible = isRowVisible(row);

								return (
									<div
										key={row.label}
										className={
											rowVisible
												? 'absolute left-3 right-3 rounded-md border border-purple-400 bg-purple-500/20 px-3 py-2 shadow-sm dark:border-purple-500 dark:bg-purple-500/25'
												: 'absolute left-3 right-3 rounded-md border border-zinc-200 bg-white px-3 py-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900'
										}
										style={{
											height: row.height,
											top: row.start,
										}}
									>
										<div className="flex h-full items-center justify-between gap-3">
											<span className="font-mono text-sm font-black">{row.label}</span>
											<span
												className={
													rowVisible
														? 'text-xs font-bold text-purple-700 dark:text-purple-200'
														: 'text-xs font-bold text-zinc-500 dark:text-zinc-400'
												}
											>
												{row.height}px measured
											</span>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function VirtualChatPanel() {
	const prefersReducedMotion = usePrefersReducedMotion();
	const chatScrollRef = React.useRef<HTMLDivElement>(null);
	const didInitialScrollRef = React.useRef(false);
	const prependAnchorRef = React.useRef<VirtualChatAnchor | null>(null);
	const shouldFollowRef = React.useRef(true);
	const isAtEndRef = React.useRef(true);
	const streamMessageIdRef = React.useRef<string | null>(null);
	const streamRunRef = React.useRef(1);
	const streamStepRef = React.useRef(0);
	const [messages, setMessages] = React.useState(initialChatMessages);
	const [scrollOffset, setScrollOffset] = React.useState(0);
	const [hasPrependedHistory, setHasPrependedHistory] = React.useState(false);
	const [isStreaming, setIsStreaming] = React.useState(false);
	const [lastChatOperation, setLastChatOperation] = React.useState("anchorTo: 'end'");
	const viewportHeight = 420;
	const overscan = 150;
	const measurements = React.useMemo(() => {
		let start = 0;

		return messages.map((message, index) => {
			const height = getChatMessageHeight(message);
			const measurement = {
				...message,
				end: start + height,
				height,
				index,
				start,
			};

			start += height + 10;

			return measurement;
		});
	}, [messages]);
	const totalSize = measurements[measurements.length - 1]?.end ?? 0;
	const maxOffset = Math.max(totalSize - viewportHeight, 0);
	const activeStart = scrollOffset;
	const activeEnd = scrollOffset + viewportHeight;
	const mountedMessages = measurements.filter(
		(message) => message.end >= activeStart - overscan && message.start <= activeEnd + overscan,
	);
	const visibleMessages = mountedMessages.filter(
		(message) => message.end >= activeStart && message.start <= activeEnd,
	);
	const distanceFromEnd = Math.max(maxOffset - scrollOffset, 0);
	const isAtEnd = distanceFromEnd < 48;

	React.useEffect(() => {
		isAtEndRef.current = isAtEnd;
	}, [isAtEnd]);

	React.useEffect(() => {
		if (didInitialScrollRef.current) {
			return;
		}

		const scrollElement = chatScrollRef.current;

		if (!scrollElement) {
			return;
		}

		didInitialScrollRef.current = true;
		scrollElement.scrollTop = maxOffset;
		setScrollOffset(maxOffset);
	}, [maxOffset]);

	React.useEffect(() => {
		const anchor = prependAnchorRef.current;

		if (!anchor) {
			return;
		}

		const scrollElement = chatScrollRef.current;
		const nextAnchor = measurements.find((message) => message.id === anchor.id);

		if (!scrollElement || !nextAnchor) {
			prependAnchorRef.current = null;
			return;
		}

		const nextOffset = Math.max(0, Math.min(nextAnchor.start - anchor.offset, maxOffset));

		scrollElement.scrollTop = nextOffset;
		setScrollOffset(nextOffset);
		prependAnchorRef.current = null;
	}, [maxOffset, measurements]);

	React.useEffect(() => {
		if (!shouldFollowRef.current) {
			return;
		}

		shouldFollowRef.current = false;

		const scrollElement = chatScrollRef.current;

		if (!scrollElement) {
			return;
		}

		const frameId = window.requestAnimationFrame(() => {
			const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

			scrollElement.scrollTo({ top: maxOffset, behavior });
			setScrollOffset(maxOffset);
		});

		return () => window.cancelAnimationFrame(frameId);
	}, [maxOffset, messages, prefersReducedMotion]);

	React.useEffect(() => {
		if (!isStreaming) {
			return;
		}

		const intervalId = window.setInterval(() => {
			const activeMessageId = streamMessageIdRef.current;
			const nextStep = streamStepRef.current + 1;
			const visibleChunkCount = Math.min(nextStep, chatStreamChunks.length);

			if (!activeMessageId) {
				window.clearInterval(intervalId);
				setIsStreaming(false);
				return;
			}

			streamStepRef.current = nextStep;
			shouldFollowRef.current = isAtEndRef.current;

			setMessages((currentMessages) =>
				currentMessages.map((message) =>
					message.id === activeMessageId
						? {
								...message,
								body: chatStreamChunks.slice(0, visibleChunkCount).join(' '),
								status: visibleChunkCount === chatStreamChunks.length ? 'complete' : 'streaming',
							}
						: message,
				),
			);

			if (visibleChunkCount === chatStreamChunks.length) {
				window.clearInterval(intervalId);
				setIsStreaming(false);
			}
		}, 680);

		return () => window.clearInterval(intervalId);
	}, [isStreaming]);

	const scrollChatToEnd = () => {
		const scrollElement = chatScrollRef.current;

		setLastChatOperation('virtualizer.scrollToEnd()');
		shouldFollowRef.current = false;

		if (!scrollElement) {
			return;
		}

		const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

		scrollElement.scrollTo({ top: maxOffset, behavior });
		setScrollOffset(maxOffset);
	};

	const prependHistory = () => {
		if (hasPrependedHistory) {
			return;
		}

		const anchorMessage = visibleMessages[0] ?? mountedMessages[0];

		if (anchorMessage) {
			prependAnchorRef.current = {
				id: anchorMessage.id,
				offset: anchorMessage.start - scrollOffset,
			};
		}

		setLastChatOperation("anchorTo: 'end' + stable getItemKey");
		setHasPrependedHistory(true);
		setMessages((currentMessages) => [...olderChatMessages, ...currentMessages]);
	};

	const streamReply = () => {
		if (isStreaming) {
			return;
		}

		const nextRun = streamRunRef.current;
		const nextMessageId = `stream-${nextRun}`;

		streamRunRef.current = nextRun + 1;
		streamStepRef.current = 1;
		streamMessageIdRef.current = nextMessageId;
		shouldFollowRef.current = isAtEndRef.current;
		setLastChatOperation('followOnAppend + measured stream');
		setIsStreaming(true);
		setMessages((currentMessages) => [
			...currentMessages,
			{
				id: nextMessageId,
				role: 'assistant',
				body: chatStreamChunks[0] ?? '',
				status: 'streaming',
			},
		]);
	};

	return (
		<div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-sky-200 bg-white p-4 shadow-sm shadow-sky-950/5 dark:border-sky-900 dark:bg-zinc-950">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-sky-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-purple-400" />
				</div>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
					{messages.length} messages / {mountedMessages.length} mounted / {visibleMessages.length}{' '}
					visible
				</span>
			</div>

			<div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
				<div className="min-w-0 rounded-lg bg-sky-50 px-3 py-2 dark:bg-sky-950/25">
					<p className="truncate font-mono text-xs font-bold text-sky-900 dark:text-sky-200">
						{lastChatOperation}
					</p>
					<p className="mt-1 text-xs font-bold text-zinc-500 dark:text-zinc-400">
						{Math.round(distanceFromEnd)}px from end / {isAtEnd ? 'pinned' : 'reading history'}
					</p>
				</div>

				<div className="grid grid-cols-3 gap-2">
					<button
						className={
							hasPrependedHistory
								? 'inline-flex items-center justify-center gap-1 rounded-md border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs font-black text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600'
								: 'inline-flex items-center justify-center gap-1 rounded-md border border-sky-200 bg-white px-3 py-2 text-xs font-black text-sky-800 transition-colors hover:border-sky-400 hover:bg-sky-50 dark:border-sky-900 dark:bg-zinc-950 dark:text-sky-200 dark:hover:border-sky-600 dark:hover:bg-sky-950/30'
						}
						disabled={hasPrependedHistory}
						type="button"
						onClick={prependHistory}
					>
						<History aria-hidden="true" size={14} />
						History
					</button>
					<button
						className={
							isStreaming
								? 'inline-flex items-center justify-center gap-1 rounded-md border border-emerald-300 bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
								: 'inline-flex items-center justify-center gap-1 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-800 transition-colors hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-950 dark:text-emerald-200 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/30'
						}
						disabled={isStreaming}
						type="button"
						onClick={streamReply}
					>
						<Send aria-hidden="true" size={14} />
						Stream
					</button>
					<button
						className="inline-flex items-center justify-center gap-1 rounded-md border border-purple-200 bg-white px-3 py-2 text-xs font-black text-purple-800 transition-colors hover:border-purple-400 hover:bg-purple-50 dark:border-purple-900 dark:bg-zinc-950 dark:text-purple-200 dark:hover:border-purple-600 dark:hover:bg-purple-950/30"
						type="button"
						onClick={scrollChatToEnd}
					>
						<ArrowDownToLine aria-hidden="true" size={14} />
						Latest
					</button>
				</div>
			</div>

			<div
				ref={chatScrollRef}
				aria-label="Virtualized AI chat transcript"
				className="mt-4 overflow-y-auto rounded-lg border border-zinc-200 bg-[#f7fbff] dark:border-zinc-800 dark:bg-zinc-900"
				role="region"
				style={{ height: viewportHeight }}
				onScroll={(event) => setScrollOffset(event.currentTarget.scrollTop)}
			>
				<div className="relative w-full" style={{ height: totalSize }}>
					{mountedMessages.map((message) => {
						const isUser = message.role === 'user';
						const isTool = message.role === 'tool';

						return (
							<div
								key={message.id}
								className="absolute left-0 right-0 px-3"
								style={{ height: message.height, top: message.start }}
							>
								<div
									className={
										isUser
											? 'ml-auto max-w-[78%] rounded-lg border border-purple-200 bg-purple-600 px-3 py-2 text-white shadow-sm shadow-purple-950/15'
											: isTool
												? 'mr-auto max-w-[82%] rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
												: 'mr-auto max-w-[82%] rounded-lg border border-sky-200 bg-white px-3 py-2 text-zinc-900 shadow-sm shadow-sky-950/5 dark:border-sky-900 dark:bg-zinc-950 dark:text-zinc-100'
									}
								>
									<div className="flex items-center justify-between gap-3">
										<span
											className={
												isUser
													? 'text-[0.65rem] font-black uppercase text-white/75'
													: isTool
														? 'text-[0.65rem] font-black uppercase text-emerald-700 dark:text-emerald-300'
														: 'text-[0.65rem] font-black uppercase text-sky-700 dark:text-sky-300'
											}
										>
											{message.role}
										</span>
										{message.status ? (
											<span className="rounded bg-white/70 px-1.5 py-0.5 text-[0.62rem] font-black uppercase text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
												{message.status}
											</span>
										) : null}
									</div>
									<p className="mt-2 text-sm font-medium leading-6">{message.body}</p>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function getChatMessageHeight(message: VirtualChatMessage) {
	const charactersPerLine = message.role === 'tool' ? 36 : 54;
	const baseHeight = message.role === 'tool' ? 74 : 92;
	const lineCount = Math.max(1, Math.ceil(message.body.length / charactersPerLine));

	return baseHeight + (lineCount - 1) * 18;
}

function PipelinePanel() {
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{pipelineSteps.map((step, index) => (
				<div
					key={step.label}
					className="rounded-lg border border-zinc-200 bg-[#fbf7ff] p-4 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-sm font-black text-purple-800 dark:bg-purple-950 dark:text-purple-200">
						{index + 1}
					</span>
					<h3 className="mt-4 text-lg font-black leading-tight">{step.label}</h3>
					<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{step.body}</p>
				</div>
			))}
		</div>
	);
}

function ModePanel() {
	return (
		<div className="grid gap-4 md:grid-cols-3">
			{virtualModes.map((mode) => (
				<div
					key={mode.title}
					className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200">
						{mode.icon}
					</span>
					<h3 className="mt-4 text-lg font-black leading-tight">{mode.title}</h3>
					<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{mode.body}</p>
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
			<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200">
				{icon}
			</span>
			<h3 className="mt-4 text-xl font-black leading-tight">{title}</h3>
			<p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
		</div>
	);
}

function SectionKicker({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
	return (
		<p className="inline-flex items-center gap-2 text-sm font-black uppercase text-purple-700 dark:text-purple-300">
			{icon}
			{children}
		</p>
	);
}

function ProofPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-l-2 border-purple-500 pl-3">
			<p className="text-sm font-black text-zinc-950 dark:text-white">{label}</p>
			<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value}</p>
		</div>
	);
}

function VirtualLink({
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
