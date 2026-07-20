import * as React from 'react';
import { Link, useParams } from '@tanstack/react-router';
import {
	ArrowRight,
	BookOpen,
	DatabaseZap,
	GalleryVerticalEnd,
	GitBranch,
	Layers,
	Network,
	PlugZap,
	RefreshCcw,
	Sparkles,
	Split,
	Zap,
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

import { LandingEcosystemProof } from '~/components/landing/LandingEcosystemProof';
import { LandingCopyPromptButton } from '~/components/landing/LandingCopyPromptButton';
const library = getLibrary('db');
const dbAgentPrompt = [
	'Build a TanStack DB data layer for a TypeScript app.',
	'Model API data as typed collections, query across collections with live queries, use optimistic mutations for local writes, and keep derived UI reactive through the DB query engine.',
	'Show how TanStack DB can start with an existing API or TanStack Query workflow, then add query-driven sync, incremental joins, and optional persistence when the product needs it.',
].join(' ');

const heroProof = [
	{
		label: 'Collections',
		value: 'typed sets of synced API data',
	},
	{
		label: 'Live queries',
		value: 'joins, filters, aggregates, reactivity',
	},
	{
		label: 'Local writes',
		value: 'optimistic transactions and rollback',
	},
];

type DbTodoStatus = 'done' | 'open';

type DbTodo = {
	id: string;
	optimistic?: boolean;
	owner: string;
	status: DbTodoStatus;
	title: string;
};

const dbInitialTodos: Array<DbTodo> = [
	{
		id: 'todo-1',
		owner: 'Tanner',
		status: 'open',
		title: 'Ship invite flow',
	},
	{
		id: 'todo-2',
		owner: 'Noah',
		status: 'open',
		title: 'Review pricing copy',
	},
	{
		id: 'todo-3',
		owner: 'David',
		status: 'done',
		title: 'Wire product analytics',
	},
];

const dbNewTodoTitles = [
	'Follow up with design partner',
	'Triage sync edge case',
	'Publish roadmap note',
];

const featureCards = [
	{
		title: 'Collections make API data queryable.',
		body: 'Load, sync, or persist typed records into collections, then query the data your UI actually needs instead of spreading derived state through components.',
		icon: <GalleryVerticalEnd size={18} />,
	},
	{
		title: 'Live queries update the result, not the whole app.',
		body: 'DB uses differential dataflow to recompute only the changed parts of joins, filters, and aggregates, so large local graphs still feel instant.',
		icon: <Zap size={18} />,
	},
	{
		title: 'Local writes are first-class.',
		body: 'Optimistic mutations can stage transactions across collections, update the UI immediately, then commit or rollback with lifecycle support.',
		icon: <RefreshCcw size={18} />,
	},
	{
		title: 'Sync strategy can evolve with the product.',
		body: 'Start with REST, GraphQL, tRPC, TanStack Query, Electric, PowerSync, Trailbase, or your own collection creator without changing how components query.',
		icon: <PlugZap size={18} />,
	},
];

const pipelineSteps = [
	{
		label: 'Collect',
		body: 'API records enter typed collections from sync engines, query functions, persistence, or custom loaders.',
	},
	{
		label: 'Query',
		body: 'The UI declares the live query shape: filters, joins, includes, aggregates, ordering, and limits.',
	},
	{
		label: 'Increment',
		body: 'When data changes, DB updates only the affected query results instead of recomputing the full graph.',
	},
	{
		label: 'Render',
		body: 'Framework adapters subscribe components to the result so the view stays current without manual cache wiring.',
	},
];

const queryDrivenSync = [
	{
		label: 'predicate',
		value: 'where issue.projectId = route.params.id',
	},
	{
		label: 'subset',
		value: 'load only the records this live query can see',
	},
	{
		label: 'dedupe',
		value: 'shared requirements collapse into fewer network calls',
	},
	{
		label: 'fallback',
		value: 'fetch broad, filter client-side, optimize later',
	},
];

const frameworkAdapters = ['React', 'Vue', 'Solid', 'Svelte', 'Vanilla'];

export default function DbLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;

	return (
		<div className="w-full min-w-0 overflow-x-hidden bg-[#fff7ed] text-zinc-950 dark:bg-zinc-950 dark:text-white">
			<section className="max-w-full overflow-hidden border-b border-orange-950/10 bg-[#fff1e4] dark:border-orange-300/10 dark:bg-[#160a03]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.84fr_1.16fr] lg:items-start lg:py-12 xl:max-w-[92rem]">
					<div className="min-w-0 max-w-full sm:max-w-3xl">
						<SectionKicker icon={<DatabaseZap size={14} />}>Reactive client store</SectionKicker>

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
							Query your API data like local reactive state.
						</p>

						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							DB turns synced API data into typed collections, then runs live queries over them so
							joins, filters, optimistic writes, and derived UI stay fast and consistent without
							hand-built client state.
						</p>

						<LibraryDownloadsMicro
							animateIncreaseTrend
							library={library}
							className="mt-5"
							label="weekly downloads"
							period="weekly"
							showTotals
						/>

						<p className="mt-4 max-w-xl border-l-2 border-orange-500 pl-3 text-sm font-black text-orange-900 dark:text-orange-200">
							The first brownfield, backend-agnostic sync engine for frontend apps.
						</p>

						<div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
							<DbLink
								to="/$libraryId/$version/docs"
								params={{ libraryId: library.id, version: resolvedVersion }}
								label="Read the docs"
								icon={<BookOpen size={16} aria-hidden="true" />}
							/>
							<LandingCopyPromptButton prompt={dbAgentPrompt} label="Copy DB Prompt" />
						</div>

						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							{heroProof.map((proof) => (
								<ProofPill key={proof.label} {...proof} />
							))}
						</div>
						<LandingEcosystemProof />
					</div>

					<DbWorkbenchPanel />
				</div>
			</section>

			<section className="border-b border-orange-950/10 bg-[#fff8f0] dark:border-orange-300/10 dark:bg-[#1b0d05]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.74fr_1.26fr] xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Sparkles size={14} />}>Why DB</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Server state gets awkward when the UI needs a data graph.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Query is excellent for fetching and caching resources. DB adds the reactive relational
							layer that product apps eventually need: local collections, cross-collection queries,
							optimistic transactions, and incremental updates.
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
						<SectionKicker icon={<GitBranch size={14} />}>Differential dataflow</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							The view is a query over collections.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							DB keeps normalized collections in memory, then updates live query results
							incrementally as records change. The UI describes the data shape; DB keeps it current.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fbfaf6] dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.82fr_1.18fr] lg:items-start xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Network size={14} />}>Query-driven sync</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Let the component query become the loading contract.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							When sync mode is on demand, DB can pass query predicates, ordering, and limits to
							your loader. Map that shape to an API precisely, or start broad and let DB filter
							locally while your API catches up.
						</p>
					</div>

					<SyncPanel />
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<Layers size={14} />}>Framework adapters</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							A data model below your renderer.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Use the adapter that fits your app while keeping collections, live queries,
							transactions, and sync strategy in the same DB model.
						</p>
						<div className="mt-5 flex flex-wrap gap-2">
							{frameworkAdapters.map((framework) => (
								<span
									key={framework}
									className="rounded-md border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-bold text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200"
								>
									{framework}
								</span>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fff7ed] py-12 dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
					<div className="max-w-3xl">
						<SectionKicker icon={<Split size={14} />}>Product shape</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Use DB when a cache starts wanting to be a database.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							It is built for apps with real relationships, local writes, subset loading, sync
							engines, persistence, and UI-shaped derived data. Keep Query for request
							orchestration; bring in DB when the client needs a reactive data graph.
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
							DB is being shaped with teams building data-heavy products.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Maintainers, examples, sync integrations, partners, and GitHub sponsors keep the
							reactive data layer close to production app problems.
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col gap-14">
					<LandingCommunitySection libraryId="db" />
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
				className="border-orange-500 bg-orange-500 text-white hover:bg-orange-600"
			/>
			<Footer />
		</div>
	);
}

function DbWorkbenchPanel() {
	const [todos, setTodos] = React.useState(dbInitialTodos);
	const [nextTodoIndex, setNextTodoIndex] = React.useState(0);
	const [lastAction, setLastAction] = React.useState('live query: open todos');
	const openTodos = todos.filter((todo) => todo.status === 'open');
	const optimisticCount = todos.filter((todo) => todo.optimistic).length;
	const insertTodo = () => {
		const title = dbNewTodoTitles[nextTodoIndex % dbNewTodoTitles.length] ?? 'New synced task';

		setTodos((currentTodos) => [
			{
				id: `todo-local-${nextTodoIndex}`,
				optimistic: true,
				owner: 'You',
				status: 'open',
				title,
			},
			...currentTodos,
		]);
		setNextTodoIndex((current) => current + 1);
		setLastAction('todoCollection.insert()');
	};
	const completeFirstOpenTodo = () => {
		const firstOpenTodo = openTodos[0];

		if (!firstOpenTodo) {
			return;
		}

		setTodos((currentTodos) =>
			currentTodos.map((todo) =>
				todo.id === firstOpenTodo.id ? { ...todo, optimistic: true, status: 'done' } : todo,
			),
		);
		setLastAction('todoCollection.update()');
	};
	const confirmServerSync = () => {
		setTodos((currentTodos) => currentTodos.map((todo) => ({ ...todo, optimistic: false })));
		setLastAction('server transaction confirmed');
	};

	return (
		<div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-orange-200 bg-white p-4 shadow-sm shadow-orange-950/5 dark:border-orange-900 dark:bg-zinc-950">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				</div>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">todo collection</span>
			</div>

			<div className="mt-4 grid gap-3 lg:grid-cols-[0.74fr_1.26fr]">
				<div className="space-y-3">
					{[
						['collection', `${todos.length} todos`],
						['live query', `${openTodos.length} open`],
						['optimistic', `${optimisticCount} pending`],
					].map(([label, value]) => (
						<div
							key={label}
							className="rounded-lg border border-zinc-200 bg-orange-50 p-3 dark:border-zinc-800 dark:bg-orange-950/20"
						>
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="font-mono text-sm font-black">{label}</p>
									<p className="mt-1 text-xs font-bold text-zinc-500 dark:text-zinc-400">
										todosCollection
									</p>
								</div>
								<span className="rounded-md bg-orange-100 px-2 py-1 text-[0.65rem] font-black uppercase text-orange-800 dark:bg-orange-950 dark:text-orange-200">
									{value}
								</span>
							</div>
						</div>
					))}
				</div>

				<div className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
					<div className="flex items-center justify-between gap-3">
						<span className="font-mono text-sm font-black">useLiveQuery(openTodos)</span>
						<span className="rounded-md bg-orange-100 px-2 py-1 text-[0.65rem] font-black uppercase text-orange-800 dark:bg-orange-950 dark:text-orange-200">
							{lastAction}
						</span>
					</div>

					<div className="mt-3 flex flex-wrap gap-2">
						<button
							className="rounded-md border border-orange-200 bg-white px-3 py-2 text-xs font-black text-orange-800 transition-colors hover:border-orange-400 dark:border-orange-900 dark:bg-zinc-950 dark:text-orange-200"
							type="button"
							onClick={insertTodo}
						>
							Insert todo
						</button>
						<button
							className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-700 transition-colors hover:border-orange-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
							type="button"
							onClick={completeFirstOpenTodo}
						>
							Complete first
						</button>
						<button
							className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-700 transition-colors hover:border-orange-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
							type="button"
							onClick={confirmServerSync}
						>
							Server confirms
						</button>
						<span className="rounded-md bg-orange-50 px-3 py-2 text-xs font-black uppercase text-orange-900 dark:bg-orange-950/25 dark:text-orange-100">
							{optimisticCount > 0 ? 'optimistic' : 'synced'}
						</span>
					</div>

					<div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
						<div className="grid grid-cols-[1.4fr_0.75fr_0.7fr] border-b border-zinc-200 bg-orange-50 text-[0.65rem] font-black uppercase text-orange-900 dark:border-zinc-800 dark:bg-orange-950/30 dark:text-orange-100">
							{['Open todo', 'Owner', 'State'].map((header) => (
								<div key={header} className="px-3 py-2">
									{header}
								</div>
							))}
						</div>
						{openTodos.map((todo) => (
							<div
								key={todo.id}
								className="grid grid-cols-[1.4fr_0.75fr_0.7fr] border-b border-zinc-100 text-sm last:border-b-0 dark:border-zinc-800"
							>
								<div className="min-w-0 px-3 py-3">
									<span className="block truncate font-bold">{todo.title}</span>
								</div>
								<div className="min-w-0 px-3 py-3">
									<span className="block truncate font-bold">{todo.owner}</span>
								</div>
								<div className="min-w-0 px-3 py-3">
									<span className="block truncate font-bold">
										{todo.optimistic ? 'pending' : 'synced'}
									</span>
								</div>
							</div>
						))}
					</div>

					<div className="mt-4 rounded-lg bg-orange-50 p-3 text-sm leading-6 text-orange-950 dark:bg-orange-950/25 dark:text-orange-100">
						Insert or complete a todo. The collection changes first, then the live query result
						updates immediately while the server catches up.
					</div>
				</div>
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
					className="rounded-lg border border-zinc-200 bg-[#fff7ed] p-4 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-sm font-black text-orange-800 dark:bg-orange-950 dark:text-orange-200">
						{index + 1}
					</span>
					<h3 className="mt-4 text-lg font-black leading-tight">{step.label}</h3>
					<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{step.body}</p>
				</div>
			))}
		</div>
	);
}

function SyncPanel() {
	return (
		<div className="min-w-0 rounded-lg border border-orange-200 bg-white p-4 dark:border-orange-900 dark:bg-zinc-950">
			<div className="rounded-lg bg-zinc-950 p-4 text-sm text-orange-100 dark:bg-black">
				<p className="font-mono leading-6">
					useLiveQuery((q) =&gt;
					<br />
					&nbsp;&nbsp;q.from({'{'} issue: issuesCollection {'}'})
					<br />
					&nbsp;&nbsp;&nbsp;&nbsp;.join({'{'} project: projectsCollection {'}'}, ({`{`} issue,
					project {`}`}) =&gt;
					<br />
					&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;eq(issue.projectId, project.id))
					<br />
					&nbsp;&nbsp;&nbsp;&nbsp;.orderBy(({`{`} issue {`}`}) =&gt; issue.updatedAt,
					&quot;desc&quot;))
				</p>
			</div>

			<div className="mt-4 grid gap-3 md:grid-cols-2">
				{queryDrivenSync.map((item) => (
					<div
						key={item.label}
						className="rounded-lg border border-zinc-200 bg-[#fff8f0] p-4 dark:border-zinc-800 dark:bg-zinc-900"
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
			<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200">
				{icon}
			</span>
			<h3 className="mt-4 text-xl font-black leading-tight">{title}</h3>
			<p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
		</div>
	);
}

function SectionKicker({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
	return (
		<p className="inline-flex items-center gap-2 text-sm font-black uppercase text-orange-700 dark:text-orange-300">
			{icon}
			{children}
		</p>
	);
}

function ProofPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-l-2 border-orange-500 pl-3">
			<p className="text-sm font-black text-zinc-950 dark:text-white">{label}</p>
			<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value}</p>
		</div>
	);
}

function DbLink({
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
