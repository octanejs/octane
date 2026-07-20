import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { twMerge } from 'tailwind-merge';
import {
	ArrowRight,
	Braces,
	CheckCircle2,
	ChevronRight,
	Clock3,
	Database,
	Keyboard,
	Newspaper,
	PackageCheck,
	Rocket,
	Search,
	SlidersHorizontal,
	Sparkles,
	Table as TableIcon,
	Terminal,
	Wrench,
	Zap,
} from 'lucide-react';

import { LibraryWordmark } from '~/components/LibraryWordmark';
import type { LibraryId, LibrarySlim } from '~/libraries';
import { formatPublishedDate } from '~/utils/blog-format';
import type { RelatedPost as RelatedPostData } from '~/utils/blog.functions';
import { categoryMeta, getCategoryLibraries, type CategorySlug } from './stack-categories';

type RelatedPost = {
	post: { slug: string; title: string; published: string; excerpt?: string };
	lib: LibrarySlim;
};

const heroTitleClassName = 'mt-4 text-3xl font-black leading-[1.04] sm:text-4xl lg:text-5xl';

const libraryLinkClassName =
	'group flex h-full flex-col rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:focus-visible:outline-white';

const staticPanelClassName =
	'rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950';

export function CategoryArticle({
	slug,
	relatedPosts: relatedPostsData,
}: {
	slug: CategorySlug;
	relatedPosts: Array<RelatedPostData>;
}) {
	const meta = categoryMeta[slug];
	const libraries = getCategoryLibraries(slug);
	const relatedPosts = reconstructRelatedPosts(libraries, relatedPostsData);

	return (
		<div className="bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
			<Breadcrumb categoryName={meta.name} />

			{slug === 'framework' ? (
				<FrameworkCategory libraries={libraries} relatedPosts={relatedPosts} />
			) : null}
			{slug === 'state' ? (
				<StateCategory libraries={libraries} relatedPosts={relatedPosts} />
			) : null}
			{slug === 'ui' ? <UiCategory libraries={libraries} relatedPosts={relatedPosts} /> : null}
			{slug === 'performance' ? (
				<PerformanceCategory libraries={libraries} relatedPosts={relatedPosts} />
			) : null}
			{slug === 'tooling' ? (
				<ToolingCategory libraries={libraries} relatedPosts={relatedPosts} />
			) : null}
		</div>
	);
}

/**
 * Reconstructs {post, lib} pairs from the server-provided, already-ordered
 * and already-sliced related-posts data, using the in-memory `libraries`
 * array (pure, client-safe) rather than sending non-serializable LibrarySlim
 * objects (e.g. `handleRedirects`) over the server-fn RPC boundary.
 */
function reconstructRelatedPosts(
	libraries: Array<LibrarySlim>,
	data: Array<RelatedPostData>,
): Array<RelatedPost> {
	const libraryById = new Map<LibraryId, LibrarySlim>(libraries.map((lib) => [lib.id, lib]));
	return data.flatMap(({ libraryId, post }) => {
		const lib = libraryById.get(libraryId);
		return lib ? [{ post, lib }] : [];
	});
}

function Breadcrumb({ categoryName }: { categoryName: string }) {
	return (
		<nav
			aria-label="Breadcrumb"
			className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
		>
			<div className="mx-auto flex max-w-7xl flex-wrap items-center gap-1.5 px-4 py-2.5 text-xs text-zinc-500 dark:text-zinc-400">
				<Link to="/" className="hover:text-zinc-950 dark:hover:text-white">
					Home
				</Link>
				<ChevronRight size={12} aria-hidden="true" />
				<Link to="/libraries" className="hover:text-zinc-950 dark:hover:text-white">
					Libraries
				</Link>
				<ChevronRight size={12} aria-hidden="true" />
				<span className="font-semibold text-zinc-700 dark:text-zinc-300">{categoryName}</span>
			</div>
		</nav>
	);
}

function FrameworkCategory({
	libraries,
	relatedPosts,
}: {
	libraries: Array<LibrarySlim>;
	relatedPosts: Array<RelatedPost>;
}) {
	const start = getLibraryById(libraries, 'start');
	const router = getLibraryById(libraries, 'router');

	return (
		<>
			<section className="border-b border-cyan-950/10 bg-[#f6fbfb] dark:border-cyan-300/10 dark:bg-[#041010]">
				<div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-start lg:py-12">
					<div className="max-w-3xl">
						<SectionKicker icon={<Sparkles size={14} />}>Framework</SectionKicker>
						<h1 className={heroTitleClassName}>Typed apps, from SPA to full-stack.</h1>
						<p className="mt-5 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Keep the same route model when an app stays client-side or grows a server boundary.
						</p>
						<div className="mt-7 flex flex-wrap gap-3">
							<LibraryButton library={start} label="Explore Start" />
							<LibraryButton library={router} label="Explore Router" muted />
						</div>
						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							{[
								['Route model', 'Routes, search, loaders, links'],
								['Server boundary', 'Rendering and functions in one app'],
								['Portable output', 'Ready for common hosts'],
							].map(([label, detail]) => (
								<div key={label} className="border-l-2 border-cyan-500/70 pl-3">
									<p className="text-sm font-bold text-zinc-950 dark:text-white">{label}</p>
									<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
										{detail}
									</p>
								</div>
							))}
						</div>
					</div>

					<FrameworkPlanPanel />
				</div>
			</section>

			<section className="bg-white dark:bg-zinc-950">
				<div className="mx-auto grid max-w-7xl gap-5 px-4 py-12 lg:grid-cols-[1.1fr_0.9fr]">
					<Link
						to={start.to ?? '#'}
						className="group flex h-full flex-col rounded-lg border border-cyan-200 bg-cyan-50 p-6 transition-colors hover:border-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-950 dark:border-cyan-900/70 dark:bg-cyan-950/20 dark:hover:border-cyan-600 dark:focus-visible:outline-cyan-100"
					>
						<LibraryTitle library={start} overline="Lead library" />
						<h2 className="mt-5 max-w-2xl text-3xl font-black leading-tight sm:text-4xl">
							<LibraryWordmark library={start} includeTanStack={false} /> takes the route tree all
							the way to production.
						</h2>
						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Use it when the app framework should own the server boundary.
						</p>
						<OpenLibraryCta
							library={start}
							className="mt-7 border-cyan-200 text-cyan-800 group-hover:border-cyan-400 group-hover:text-cyan-950 dark:border-cyan-800 dark:text-cyan-200 dark:group-hover:border-cyan-500 dark:group-hover:text-white"
						/>
					</Link>

					<Link to={router.to ?? '#'} className={twMerge(libraryLinkClassName, 'p-6')}>
						<LibraryTitle library={router} overline="Foundation" />
						<div className="mt-5 rounded-lg border border-emerald-200 bg-white p-4 font-mono text-xs leading-6 text-zinc-700 dark:border-emerald-900 dark:bg-zinc-950 dark:text-zinc-300">
							{[
								'routes/__root.tsx',
								'routes/index.tsx',
								'routes/projects.$id.tsx',
								'loader: typed project data',
								'search: validated filters',
							].map((line, index) => (
								<div key={line} className="flex items-center gap-3">
									<span className="w-5 text-right text-emerald-600 dark:text-emerald-400">
										{index + 1}
									</span>
									<span>{line}</span>
								</div>
							))}
						</div>
						<p className="mt-5 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Use it when routing is the foundation, without needing a full server app.
						</p>
						<OpenLibraryCta library={router} className="mt-5" />
					</Link>
				</div>
			</section>

			<RelatedPostsBlock items={relatedPosts} />
		</>
	);
}

function FrameworkPlanPanel() {
	return (
		<div className="rounded-lg border border-cyan-950/10 bg-white p-5 shadow-sm shadow-cyan-950/5 dark:border-cyan-300/15 dark:bg-zinc-950">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<p className="text-xs font-bold text-cyan-700 dark:text-cyan-300">App plan</p>
					<p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
						Map the product brief before choosing the runtime boundary.
					</p>
				</div>
				<span className="inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200">
					<Rocket size={13} aria-hidden="true" />
					App-ready
				</span>
			</div>
			<div className="mt-5 grid gap-3 sm:grid-cols-3">
				{[
					['Routes', 'Nested screens'],
					['Data', 'Load before render'],
					['Server', 'Add only when needed'],
				].map(([label, detail]) => (
					<div key={label} className="border-l-2 border-cyan-500/60 pl-3">
						<p className="text-sm font-black text-zinc-950 dark:text-white">{label}</p>
						<p className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">{detail}</p>
					</div>
				))}
			</div>
			<div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 font-mono text-xs leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
				{[
					'/ routes and layouts',
					'+ loaders before render',
					'+ server boundary when needed',
					'-> deploy target ready',
				].map((line) => (
					<div key={line}>{line}</div>
				))}
			</div>
		</div>
	);
}

function StateCategory({
	libraries,
	relatedPosts,
}: {
	libraries: Array<LibrarySlim>;
	relatedPosts: Array<RelatedPost>;
}) {
	const query = getLibraryById(libraries, 'query');
	const db = getLibraryById(libraries, 'db');
	const store = getLibraryById(libraries, 'store');
	const ai = getLibraryById(libraries, 'ai');

	return (
		<>
			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
					<div>
						<SectionKicker icon={<Database size={14} />}>Data & State Management</SectionKicker>
						<h1 className={heroTitleClassName}>The right state layer for every kind of data.</h1>
						<p className="mt-5 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Remote cache, synced collections, local signals, and model work. Pick by who owns the
							truth.
						</p>
					</div>

					<div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900">
						<div className="grid gap-3">
							{[
								{
									key: 'cache',
									label: 'Cache',
									detail: 'freshness, retries, invalidation',
								},
								{
									key: 'collect',
									label: 'Collect',
									detail: 'live queries, optimistic writes',
								},
								{
									key: 'signal',
									label: 'Signal',
									detail: 'selectors, derived state, adapters',
								},
								{
									key: 'model',
									label: 'Model',
									detail: 'providers, tools, AG-UI streams',
								},
							].map(({ key, label, detail }) => (
								<div
									key={key}
									className="grid gap-2 border-l-2 border-zinc-200 py-2 pl-3 dark:border-zinc-700 sm:grid-cols-[7rem_1fr] sm:items-baseline"
								>
									<div className="text-sm font-black text-zinc-950 dark:text-white">{label}</div>
									<p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">{detail}</p>
								</div>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="bg-white dark:bg-zinc-950">
				<div className="mx-auto max-w-7xl px-4 py-12">
					<h2 className="text-2xl font-black leading-tight sm:text-3xl">
						Open the state libraries
					</h2>

					<div className="mt-6 grid gap-4 md:grid-cols-2">
						<StateLibraryCard
							library={query}
							title="Remote server data"
							body="Cache API data with stale time, retries, mutations, and invalidation."
						/>
						<StateLibraryCard
							library={db}
							title="Synced client collections"
							body="Read live collections locally while writes reconcile with an API."
						/>
						<StateLibraryCard
							library={store}
							title="Local reactive state"
							body="Keep client-owned state small, derived, and framework-friendly."
						/>
						<StateLibraryCard
							library={ai}
							title="Typed model work"
							body="Represent providers, tools, streams, and AG-UI events in TypeScript."
						/>
					</div>
				</div>
			</section>

			<RelatedPostsBlock items={relatedPosts} />
		</>
	);
}

function StateLibraryCard({
	body,
	library,
	title,
}: {
	body: string;
	library: LibrarySlim;
	title: string;
}) {
	return (
		<Link to={library.to ?? '#'} className={libraryLinkClassName}>
			<LibraryTitle library={library} />
			<h3 className="mt-4 text-2xl font-black leading-tight">{title}</h3>
			<p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
			<OpenLibraryCta library={library} className="mt-5" />
		</Link>
	);
}

function UiCategory({
	libraries,
	relatedPosts,
}: {
	libraries: Array<LibrarySlim>;
	relatedPosts: Array<RelatedPost>;
}) {
	const table = getLibraryById(libraries, 'table');
	const form = getLibraryById(libraries, 'form');
	const hotkeys = getLibraryById(libraries, 'hotkeys');

	return (
		<>
			<section className="border-b border-zinc-200 bg-[#f8faf9] dark:border-zinc-800 dark:bg-[#090b0d]">
				<div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
					<div>
						<SectionKicker icon={<TableIcon size={14} />}>UI & UX</SectionKicker>
						<h1 className={heroTitleClassName}>
							Headless engines for the UI users actually touch.
						</h1>
						<p className="mt-5 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Keep the markup and styling. Let the state model handle rows, fields, validation,
							shortcut scopes, and type safety.
						</p>
					</div>

					<InteractionWorkbench />
				</div>
			</section>

			<section className="bg-white dark:bg-zinc-950">
				<div className="mx-auto max-w-7xl px-4 py-12">
					<h2 className="text-2xl font-black leading-tight sm:text-3xl">Open the UI libraries</h2>

					<div className="mt-6 grid gap-4 lg:grid-cols-3">
						<UiSurfaceCard
							detail="Sort, filter, group, size, select, and virtualize without taking a table skin."
							icon={<TableIcon size={18} />}
							library={table}
							title="Data density"
						/>
						<UiSurfaceCard
							detail="Field state, validation, submission, and async checks without losing control of inputs."
							icon={<SlidersHorizontal size={18} />}
							library={form}
							title="Input confidence"
						/>
						<UiSurfaceCard
							detail="Scopes, sequences, key state, and command surfaces for keyboard-first flows."
							icon={<Keyboard size={18} />}
							library={hotkeys}
							title="Keyboard flow"
						/>
					</div>
				</div>
			</section>

			<RelatedPostsBlock items={relatedPosts} />
		</>
	);
}

function InteractionWorkbench() {
	return (
		<div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-950">
			<div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
				<div className={twMerge(staticPanelClassName, 'border-l-2 border-l-blue-500')}>
					<SignalLabel dotClassName="bg-blue-500" label="Rows" overline="Grid state" />
					<TableSample />
				</div>
				<div className="grid gap-4">
					<div className={twMerge(staticPanelClassName, 'border-l-2 border-l-yellow-500')}>
						<SignalLabel dotClassName="bg-yellow-500" label="Fields" overline="Input state" />
						<FormSample />
					</div>
					<div className={twMerge(staticPanelClassName, 'border-l-2 border-l-rose-500')}>
						<SignalLabel dotClassName="bg-rose-500" label="Commands" overline="Command state" />
						<HotkeysSample />
					</div>
				</div>
			</div>
		</div>
	);
}

function UiSurfaceCard({
	detail,
	icon,
	library,
	title,
}: {
	detail: string;
	icon: React.ReactNode;
	library: LibrarySlim;
	title: string;
}) {
	return (
		<Link to={library.to ?? '#'} className={libraryLinkClassName}>
			<div className="flex items-center justify-between gap-3">
				<LibraryTitle library={library} overline={title} />
				<span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
					{icon}
				</span>
			</div>
			<p className="mt-5 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{detail}</p>
			<OpenLibraryCta library={library} className="mt-5" />
		</Link>
	);
}

function TableSample() {
	return (
		<div className="mt-4 overflow-hidden rounded-lg border border-blue-200 bg-white text-xs dark:border-blue-900 dark:bg-zinc-950">
			<div className="grid grid-cols-3 bg-blue-100 font-bold text-blue-950 dark:bg-blue-950/60 dark:text-blue-100">
				{['Name', 'Status', 'MRR'].map((heading) => (
					<div key={heading} className="px-3 py-2">
						{heading}
					</div>
				))}
			</div>
			{[
				['Acme', 'Active', '$12k'],
				['Orbit', 'Trial', '$4k'],
				['North', 'Active', '$8k'],
			].map((row) => (
				<div
					key={row.join(':')}
					className="grid grid-cols-3 border-t border-blue-100 text-zinc-600 dark:border-blue-900/60 dark:text-zinc-300"
				>
					{row.map((cell) => (
						<div key={cell} className="px-3 py-2">
							{cell}
						</div>
					))}
				</div>
			))}
		</div>
	);
}

function FormSample() {
	return (
		<div className="mt-4 space-y-2 text-xs">
			{[
				['Email', 'team@tanstack.com'],
				['Plan', 'Startup'],
			].map(([label, value]) => (
				<div key={label}>
					<p className="mb-1 font-semibold text-yellow-800 dark:text-yellow-200">{label}</p>
					<div className="rounded-md border border-yellow-200 bg-white px-3 py-2 text-zinc-600 dark:border-yellow-900 dark:bg-zinc-950 dark:text-zinc-300">
						{value}
					</div>
				</div>
			))}
			<div className="flex items-center gap-1.5 text-yellow-800 dark:text-yellow-200">
				<CheckCircle2 size={14} aria-hidden="true" />
				Schema and field state agree
			</div>
		</div>
	);
}

function HotkeysSample() {
	return (
		<div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
			{['Cmd', 'K', 'then', 'P'].map((key) => (
				<span
					key={key}
					className="rounded-md border border-rose-200 bg-white px-2.5 py-2 font-bold text-rose-800 shadow-sm dark:border-rose-900 dark:bg-zinc-950 dark:text-rose-200"
				>
					{key}
				</span>
			))}
			<span className="basis-full text-rose-800 dark:text-rose-200">
				Sequence opens project switcher
			</span>
		</div>
	);
}

function PerformanceCategory({
	libraries,
	relatedPosts,
}: {
	libraries: Array<LibrarySlim>;
	relatedPosts: Array<RelatedPost>;
}) {
	const virtual = getLibraryById(libraries, 'virtual');
	const pacer = getLibraryById(libraries, 'pacer');

	return (
		<>
			<section className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-[#0b0d08]">
				<div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
					<div>
						<SectionKicker icon={<Zap size={14} />}>Performance</SectionKicker>
						<h1 className={heroTitleClassName}>Render less, schedule less, stay fast.</h1>
						<p className="mt-5 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Keep large interfaces and event-heavy surfaces inside the next frame.
						</p>
					</div>

					<FrameBudgetLab />
				</div>
			</section>

			<section className="bg-white dark:bg-zinc-950">
				<div className="mx-auto max-w-7xl px-4 py-12">
					<div className="grid gap-4 lg:grid-cols-2">
						<PerformanceLibraryPanel
							body="Render only the visible slice and measure rows as they change."
							library={virtual}
							title="Virtual reduces the visible work."
						/>
						<PerformanceLibraryPanel
							body="Debounce, throttle, queue, batch, and rate-limit expensive work."
							library={pacer}
							title="Pacer shapes time before it reaches work."
						/>
					</div>
				</div>
			</section>

			<RelatedPostsBlock items={relatedPosts} />
		</>
	);
}

function FrameBudgetLab() {
	return (
		<div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-950">
			<div className="mb-5 flex items-center justify-between gap-3">
				<p className="font-bold">16ms frame lab</p>
				<Clock3 className="text-lime-700 dark:text-lime-300" size={18} />
			</div>
			<div className="grid gap-4 md:grid-cols-2">
				<div className={twMerge(staticPanelClassName, 'border-l-2 border-l-purple-500')}>
					<SignalLabel dotClassName="bg-purple-500" label="Visible rows" overline="DOM pressure" />
					<div className="mt-4 space-y-1.5">
						{Array.from({ length: 7 }).map((_, index) => (
							<div
								key={index}
								className={twMerge(
									'h-7 rounded-md border px-3 text-xs leading-7',
									index > 1 && index < 5
										? 'border-purple-300 bg-white text-purple-900 dark:border-purple-700 dark:bg-zinc-950 dark:text-purple-100'
										: 'border-purple-100 bg-purple-100/70 text-purple-400 dark:border-purple-900/60 dark:bg-purple-950/20 dark:text-purple-500',
								)}
							>
								row {index + 121}
							</div>
						))}
					</div>
				</div>
				<div className={twMerge(staticPanelClassName, 'border-l-2 border-l-lime-500')}>
					<SignalLabel dotClassName="bg-lime-500" label="Event stream" overline="Event pressure" />
					<div className="mt-4 space-y-3">
						{[
							['input burst', 'debounce'],
							['scroll stream', 'throttle'],
							['write queue', 'batch'],
						].map(([event, action]) => (
							<div
								key={event}
								className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md bg-white px-3 py-2 text-xs dark:bg-zinc-950"
							>
								<span className="text-zinc-600 dark:text-zinc-300">{event}</span>
								<span className="rounded-md bg-lime-100 px-2 py-1 font-bold text-lime-800 dark:bg-lime-950 dark:text-lime-200">
									{action}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function PerformanceLibraryPanel({
	body,
	library,
	title,
}: {
	body: string;
	library: LibrarySlim;
	title: string;
}) {
	return (
		<Link to={library.to ?? '#'} className={twMerge(libraryLinkClassName, 'p-6')}>
			<h2 className="text-3xl font-black leading-tight">
				<LibraryLeadTitle library={library} title={title} />
			</h2>
			<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">{body}</p>
			<OpenLibraryCta library={library} className="mt-6" />
		</Link>
	);
}

function LibraryLeadTitle({ library, title }: { library: LibrarySlim; title: string }) {
	const productName = shortName(library);

	if (!title.startsWith(productName)) {
		return <>{title}</>;
	}

	return (
		<>
			<LibraryWordmark library={library} includeTanStack={false} />
			{title.slice(productName.length)}
		</>
	);
}

function ToolingCategory({
	libraries,
	relatedPosts,
}: {
	libraries: Array<LibrarySlim>;
	relatedPosts: Array<RelatedPost>;
}) {
	const devtools = getLibraryById(libraries, 'devtools');
	const config = getLibraryById(libraries, 'config');
	const cli = getLibraryById(libraries, 'cli');
	const intent = getLibraryById(libraries, 'intent');

	return (
		<>
			<section className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
					<div>
						<SectionKicker icon={<Wrench size={14} />}>Tooling</SectionKicker>
						<h1 className={heroTitleClassName}>The tools around TanStack apps and packages.</h1>
						<p className="mt-5 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							A smaller loop around projects, packages, runtime inspection, and package-level
							guidance.
						</p>
					</div>

					<ToolingWorkbench />
				</div>
			</section>

			<section className="bg-white dark:bg-zinc-950">
				<div className="mx-auto max-w-7xl px-4 py-12">
					<h2 className="text-2xl font-black leading-tight sm:text-3xl">Open the tools</h2>
					<div className="mt-6 grid gap-4 lg:grid-cols-4">
						<ToolingStep
							detail="Create Start apps, search docs, and export prompts."
							icon={<Terminal size={18} />}
							library={cli}
							step="Create"
						/>
						<ToolingStep
							detail="Lint, build, test, version, and publish packages."
							icon={<PackageCheck size={18} />}
							library={config}
							step="Package"
						/>
						<ToolingStep
							detail="Inspect TanStack libraries through one dockable panel."
							icon={<Search size={18} />}
							library={devtools}
							step="Inspect"
						/>
						<ToolingStep
							detail="Ship package-scoped guidance for assistants."
							icon={<Braces size={18} />}
							library={intent}
							step="Remember"
						/>
					</div>
				</div>
			</section>

			<RelatedPostsBlock items={relatedPosts} />
		</>
	);
}

function ToolingWorkbench() {
	return (
		<div className="rounded-lg border border-zinc-200 bg-zinc-950 p-4 text-white shadow-sm shadow-zinc-950/10 dark:border-zinc-800">
			<div className="mb-4 flex items-center gap-2 text-sm text-zinc-400">
				<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
				<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
				<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				<span className="ml-2 font-mono">package-workbench</span>
			</div>
			<div className="grid gap-3 md:grid-cols-2">
				<WorkbenchCell
					code={['create app workspace', 'template: app + data']}
					icon={<Terminal size={16} />}
					label="Create"
				/>
				<WorkbenchCell
					code={['shared lint/build/test', 'publish: versions ready']}
					icon={<PackageCheck size={16} />}
					label="Package"
				/>
				<WorkbenchCell
					code={['runtime panel open', 'custom dock: app metrics']}
					icon={<Search size={16} />}
					label="Inspect"
				/>
				<WorkbenchCell
					code={['package notes installed', 'context: dependency-scoped']}
					icon={<Braces size={16} />}
					label="Remember"
				/>
			</div>
		</div>
	);
}

function WorkbenchCell({
	code,
	icon,
	label,
}: {
	code: Array<string>;
	icon: React.ReactNode;
	label: string;
}) {
	return (
		<div className="rounded-lg border border-white/10 bg-white/5 p-4">
			<div className="flex items-center gap-2 text-white">
				{icon}
				<span className="text-sm font-black leading-tight">{label}</span>
			</div>
			<div className="mt-4 space-y-1 font-mono text-xs text-zinc-300">
				{code.map((line) => (
					<div key={line}>{line}</div>
				))}
			</div>
		</div>
	);
}

function ToolingStep({
	detail,
	icon,
	library,
	step,
}: {
	detail: string;
	icon: React.ReactNode;
	library: LibrarySlim;
	step: string;
}) {
	return (
		<Link to={library.to ?? '#'} className={libraryLinkClassName}>
			<div className="flex items-center justify-between gap-3">
				<span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
					{icon}
				</span>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{step}</span>
			</div>
			<LibraryTitle library={library} className="mt-5" />
			<p className="mt-4 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{detail}</p>
			<OpenLibraryCta library={library} className="mt-5" />
		</Link>
	);
}

function RelatedPostsBlock({ items }: { items: Array<RelatedPost> }) {
	if (items.length === 0) {
		return null;
	}

	return (
		<section className="border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
			<div className="mx-auto max-w-7xl px-4 py-12">
				<SectionKicker icon={<Newspaper size={14} />}>From the team</SectionKicker>
				<h2 className="mt-3 text-2xl font-black leading-tight sm:text-3xl">
					Recent writing from these libraries
				</h2>
				<ul className="mt-6 grid gap-3 md:grid-cols-2">
					{items.map(({ post, lib }) => (
						<li key={post.slug}>
							<Link
								to="/blog/$"
								params={{ _splat: post.slug }}
								className="group flex h-full flex-col rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
							>
								<div className="flex flex-wrap items-center gap-2">
									<span
										className={twMerge(
											'inline-flex rounded-md bg-linear-to-r px-2 py-1 text-xs font-black text-white',
											lib.colorFrom,
											lib.colorTo,
										)}
									>
										<LibraryWordmark library={lib} includeTanStack={false} colorProduct={false} />
									</span>
									<span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
										{formatPublishedDate(post.published)}
									</span>
								</div>
								<p className="mt-3 text-base font-bold leading-snug group-hover:underline">
									{post.title}
								</p>
								{post.excerpt ? (
									<p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
										{post.excerpt}
									</p>
								) : null}
							</Link>
						</li>
					))}
				</ul>
			</div>
		</section>
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

function SignalLabel({
	className,
	dotClassName,
	label,
	overline,
}: {
	className?: string;
	dotClassName: string;
	label: string;
	overline?: string;
}) {
	return (
		<div className={twMerge('min-w-0', className)}>
			{overline ? (
				<p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">{overline}</p>
			) : null}
			<div
				className={twMerge(
					'inline-flex items-center gap-2 text-sm font-black leading-tight',
					overline ? 'mt-1' : undefined,
				)}
			>
				<span className={twMerge('h-2 w-2 rounded-full', dotClassName)} />
				<span>{label}</span>
			</div>
		</div>
	);
}

function LibraryTitle({
	className,
	library,
	overline,
}: {
	className?: string;
	library: LibrarySlim;
	overline?: string;
}) {
	return (
		<div className={twMerge('min-w-0', className)}>
			{overline ? (
				<p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">{overline}</p>
			) : null}
			<div className={twMerge('flex flex-wrap items-center gap-2', overline ? 'mt-1' : undefined)}>
				<h3 className="text-xl font-black leading-tight">
					<LibraryWordmark library={library} />
				</h3>
				{library.badge ? (
					<span
						className={twMerge(
							'rounded-md bg-linear-to-r px-1.5 py-0.5 text-xs font-black uppercase',
							library.colorFrom,
							library.colorTo,
							library.badgeTextStyle ?? 'text-white',
						)}
					>
						{library.badge}
					</span>
				) : null}
			</div>
		</div>
	);
}

function OpenLibraryCta({ className, library }: { className?: string; library: LibrarySlim }) {
	return (
		<span
			className={twMerge(
				'mt-auto inline-flex w-fit items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700 transition-colors group-hover:border-zinc-400 group-hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:group-hover:border-zinc-500 dark:group-hover:text-white',
				className,
			)}
		>
			Open {shortName(library)}
			<ArrowRight size={13} aria-hidden="true" />
		</span>
	);
}

function LibraryButton({
	label,
	library,
	muted = false,
}: {
	label: string;
	library: LibrarySlim;
	muted?: boolean;
}) {
	const productName = shortName(library);
	const actionLabel = label.endsWith(productName)
		? label.slice(0, -productName.length).trim()
		: label;

	return (
		<Link
			to={library.to ?? '#'}
			className={twMerge(
				'inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors',
				muted
					? 'border-zinc-300 bg-white text-zinc-800 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-500'
					: 'border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200',
			)}
		>
			{actionLabel ? `${actionLabel} ` : null}
			{label.endsWith(productName) ? (
				<LibraryWordmark library={library} includeTanStack={false} colorProduct={false} />
			) : null}
			<ArrowRight size={15} aria-hidden="true" />
		</Link>
	);
}

function getLibraryById(libraries: Array<LibrarySlim>, libraryId: LibrarySlim['id']) {
	const library = libraries.find((candidate) => candidate.id === libraryId);

	if (library) {
		return library;
	}

	const fallback = libraries[0];

	if (!fallback) {
		throw new Error(`No libraries available for category lookup: ${libraryId}`);
	}

	return fallback;
}

function shortName(library: LibrarySlim) {
	return library.name.replace('TanStack ', '');
}
