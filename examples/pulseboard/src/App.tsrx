import { useCallback, useEffect, useMemo, useRef, useState } from 'octane';
import {
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	useReactTable,
} from '@octanejs/tanstack-table';
import type { ColumnDef } from '@octanejs/tanstack-table';
import { useVirtualizer } from '@octanejs/tanstack-virtual';
import { ParentSize } from '@octanejs/visx/responsive';
import { scaleLinear, scalePoint } from '@octanejs/visx/scale';
import { LinePath } from '@octanejs/visx/shape';
import { GridRows } from '@octanejs/visx/grid';
import {
	ACTIVITY_EVENTS,
	CAMPAIGNS,
	VIEW_COPY,
	formatCurrency,
	formatInteger,
	isDashboardView,
	trendFor,
} from './data';
import type {
	ActivityEvent,
	CampaignRow,
	DashboardView,
	DateRange,
	LogLevel,
	TrendPoint,
} from './data';

type LoadState = 'loading' | 'ready' | 'error';
type RefreshState = 'idle' | 'refreshing' | 'error';

type SearchDestination = {
	id: string;
	label: string;
	description: string;
	view?: DashboardView;
	target?: string;
};

const CHART_HEIGHT = 302;
const CHART_MARGIN = { top: 24, right: 24, bottom: 38, left: 52 };
const LOG_ESTIMATE = () => 68;

const SEARCH_DESTINATIONS: SearchDestination[] = [
	{
		id: 'overview',
		label: 'Growth overview',
		description: 'Overview report',
		view: 'overview',
	},
	{
		id: 'acquisition',
		label: 'Acquisition health',
		description: 'Acquisition report',
		view: 'acquisition',
	},
	{
		id: 'revenue',
		label: 'Revenue momentum',
		description: 'Revenue report',
		view: 'revenue',
	},
	{
		id: 'campaigns',
		label: 'Campaign performance',
		description: 'Campaign table',
		target: 'campaign-table',
	},
	{
		id: 'activity',
		label: 'Live activity',
		description: 'Operational event log',
		target: 'live-activity',
	},
];

const NOTIFICATIONS = [
	{
		id: 'checkout',
		title: 'Checkout conversion recovered',
		detail: 'Mobile checkout returned to its seeded baseline.',
	},
	{
		id: 'campaign',
		title: 'Campaign pacing needs review',
		detail: 'Signal search is 12% ahead of its weekly budget.',
	},
	{
		id: 'snapshot',
		title: 'Northstar snapshot is ready',
		detail: 'Revision 1 finished indexing 360 activity events.',
	},
];

function readView(): DashboardView {
	const segment = window.location.pathname.split('/').filter(Boolean).at(-1);
	return isDashboardView(segment) ? segment : 'overview';
}

function readRange(): DateRange {
	return new URLSearchParams(window.location.search).get('range') === '30d' ? '30d' : '7d';
}

function scenarioSet(): Set<string> {
	return new Set((new URLSearchParams(window.location.search).get('scenario') ?? '').split(',').map(
		(value) => value.trim(),
	).filter(Boolean));
}

function hrefFor(view: DashboardView, range: DateRange): string {
	const parameters = new URLSearchParams(window.location.search);
	parameters.set('range', range);
	const query = parameters.toString();
	return `/workspaces/northstar/${view}${query === '' ? '' : `?${query}`}`;
}

function LoadingDashboard() {
	return <main class="state-page" aria-label="Loading Pulseboard analytics" aria-busy="true">
		<section class="state-card state-card--loading">
			<div class="pulse-mark" aria-hidden="true">
				<span></span>
				<span></span>
				<span></span>
			</div>
			<p class="eyebrow">Northstar workspace</p>
			<h1>Reading the latest signals</h1>
			<p>Preparing deterministic journeys, campaigns, and 360 operational events…</p>
			<div class="loading-bars" aria-hidden="true">
				<i></i>
				<i></i>
				<i></i>
			</div>
		</section>
	</main>;
}

function LoadFailure({ onRetry }: { onRetry: () => void }) {
	return <main class="state-page">
		<section class="state-card" role="alert">
			<div class="state-icon" aria-hidden="true">!</div>
			<p class="eyebrow">Northstar workspace</p>
			<h1>We couldn’t load this dashboard</h1>
			<p>The seeded analytics snapshot stopped before any report state was applied.</p>
			<button class="primary-button" type="button" onClick={onRetry}>Retry dashboard load</button>
		</section>
	</main>;
}

function AppIcon() {
	return <span class="app-icon" aria-hidden="true">
		<svg viewBox="0 0 28 28">
			<path d="M5 20V12M11 20V7M17 20v-5M23 20V4" />
		</svg>
	</span>;
}

function Sidebar(props: {
	view: DashboardView;
	range: DateRange;
	onNavigate: (view: DashboardView) => void;
}) {
	const navigation: Array<{ view: DashboardView; label: string; glyph: string }> = [
		{ view: 'overview', label: 'Overview', glyph: '⌁' },
		{ view: 'acquisition', label: 'Acquisition', glyph: '↗' },
		{ view: 'revenue', label: 'Revenue', glyph: '◇' },
	];
	return <aside class="sidebar" aria-label="Pulseboard navigation">
		<a
			class="brand"
			href={hrefFor('overview', props.range)}
			onClick={(event) => {
				event.preventDefault();
				props.onNavigate('overview');
			}}
		>
			<AppIcon />
			<span>
				<strong>Pulseboard</strong>
				<small>Analytics OS</small>
			</span>
		</a>
		<nav aria-label="Workspace sections">
			<p>Workspace</p>
			@for (const item of navigation; key item.view) {
				<a
					class={{ 'nav-link': true, 'nav-link--active': item.view === props.view }}
					href={hrefFor(item.view, props.range)}
					aria-current={item.view === props.view ? 'page' : undefined}
					onClick={(event) => {
						event.preventDefault();
						props.onNavigate(item.view);
					}}
				>
					<span aria-hidden="true">{item.glyph}</span>
					{item.label}
				</a>
			}
			<p>Explore</p>
			<a class="nav-link" href="#campaign-table">
				<span aria-hidden="true">▦</span>
				Campaigns
			</a>
			<a class="nav-link" href="#live-activity">
				<span aria-hidden="true">≋</span>
				Live activity
			</a>
		</nav>
		<div class="workspace-card">
			<span class="workspace-avatar" aria-hidden="true">N</span>
			<span>
				<strong>Northstar</strong>
				<small>Production data</small>
			</span>
			<i aria-hidden="true">•••</i>
		</div>
	</aside>;
}

function MobileNavigation(props: {
	view: DashboardView;
	range: DateRange;
	onNavigate: (view: DashboardView) => void;
	onClose: () => void;
}) {
	const items: Array<{ view: DashboardView; label: string }> = [
		{ view: 'overview', label: 'Overview' },
		{ view: 'acquisition', label: 'Acquisition' },
		{ view: 'revenue', label: 'Revenue' },
	];
	return <nav
		class="mobile-navigation"
		id="mobile-navigation"
		aria-label="Mobile workspace sections"
	>
		<div>
			<strong>Northstar workspace</strong>
			<button type="button" onClick={props.onClose} aria-label="Close navigation">×</button>
		</div>
		@for (const item of items; key item.view) {
			<a
				href={hrefFor(item.view, props.range)}
				aria-current={item.view === props.view ? 'page' : undefined}
				onClick={(event) => {
					event.preventDefault();
					props.onNavigate(item.view);
				}}
			>
				{item.label}
				<span aria-hidden="true">→</span>
			</a>
		}
	</nav>;
}

function MetricCards({ view }: { view: DashboardView }) {
	const metrics =
		view === 'revenue'
			? [
					{ label: 'Net revenue', value: '$824.6k', delta: '+18.4%', tone: 'violet' },
					{ label: 'Expansion', value: '$142.8k', delta: '+9.7%', tone: 'mint' },
					{ label: 'Retention', value: '94.2%', delta: '+1.8%', tone: 'blue' },
					{ label: 'At risk', value: '$38.1k', delta: '−4.2%', tone: 'amber' },
				]
			: view === 'acquisition'
				? [
						{ label: 'Qualified visits', value: '82,490', delta: '+16.8%', tone: 'violet' },
						{ label: 'Activated', value: '6,812', delta: '+11.3%', tone: 'mint' },
						{ label: 'Cost / activated', value: '$42.80', delta: '−8.1%', tone: 'blue' },
						{ label: 'Channel alerts', value: '3', delta: '2 resolved', tone: 'amber' },
					]
				: [
						{ label: 'Active visitors', value: '128,420', delta: '+14.2%', tone: 'violet' },
						{ label: 'Conversions', value: '9,284', delta: '+10.8%', tone: 'mint' },
						{ label: 'Activation rate', value: '7.23%', delta: '+0.6%', tone: 'blue' },
						{ label: 'Signals to review', value: '7', delta: '3 urgent', tone: 'amber' },
					];
	return <section class="metric-grid" aria-label={`${VIEW_COPY[view].title} metrics`}>
		@for (const metric of metrics; key metric.label) {
			<article class={`metric-card metric-card--${metric.tone}`}>
				<header>
					<span>{metric.label}</span>
					<i aria-hidden="true">↗</i>
				</header>
				<strong>{metric.value}</strong>
				<footer>
					<span>{metric.delta}</span>
					vs previous period
				</footer>
			</article>
		}
	</section>;
}

function ChartFrame(props: { width: number; points: TrendPoint[]; range: DateRange }) @{
	const width = Math.max(320, Math.round(props.width));
	const innerWidth = Math.max(220, width - CHART_MARGIN.left - CHART_MARGIN.right);
	const innerHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
	const [activeIndex, setActiveIndex] = useState(props.points.length - 1);
	const pointRefs = useRef(new Map<number, SVGGElement>());
	const xScale = scalePoint({
		domain: props.points.map((point) => point.id),
		range: [0, innerWidth],
	});
	const maximum = Math.max(...props.points.map((point) => point.visitors));
	const minimum = Math.min(...props.points.map((point) => point.visitors));
	const yScale = scaleLinear({
		domain: [Math.max(0, minimum - 260), maximum + 160],
		range: [innerHeight, 0],
		nice: true,
	});
	const safeIndex = Math.min(activeIndex, props.points.length - 1);
	const activePoint = props.points[safeIndex];

	useEffect(() => {
		setActiveIndex(props.points.length - 1);
	}, [props.points]);

	const moveFocus = (currentIndex: number, direction: number) => {
		const next = Math.max(0, Math.min(props.points.length - 1, currentIndex + direction));
		setActiveIndex(next);
		window.requestAnimationFrame(() => pointRefs.current.get(next)?.focus());
	};

	<div class="chart-frame">
		<svg
			class="trend-chart"
			width={width}
			height={CHART_HEIGHT}
			viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
			role="group"
			aria-label={`Visitors trend, last ${props.range === '7d' ? '7 days' : '30 days'}`}
		>
			<defs>
				<linearGradient id="pulse-area" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="#7558f6" stop-opacity="0.28" />
					<stop offset="100%" stop-color="#7558f6" stop-opacity="0" />
				</linearGradient>
			</defs>
			<g transform={`translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`}>
				<GridRows scale={yScale} width={innerWidth} numTicks={4} stroke="#e7e9f2" />
				<LinePath
					data={props.points}
					x={(point) => xScale(point.id) ?? 0}
					y={(point) => yScale(point.visitors)}
					stroke="#7357f5"
					strokeWidth={3}
				/>
				@for (const point of props.points; index pointIndex; key point.id) {
					<g
						ref={(node) => {
							if (node) pointRefs.current.set(pointIndex, node);
							else pointRefs.current.delete(pointIndex);
						}}
						class={{ 'chart-point': true, 'chart-point--active': pointIndex === safeIndex }}
						transform={`translate(${xScale(point.id) ?? 0},${yScale(point.visitors)})`}
						role="button"
						tabIndex={pointIndex === safeIndex ? 0 : -1}
						aria-label={`${point.label}: ${formatInteger(point.visitors)} visitors, ${formatInteger(
							point.conversions,
						)} conversions`}
						onFocus={() => setActiveIndex(pointIndex)}
						onPointerEnter={() => setActiveIndex(pointIndex)}
						onKeyDown={(event) => {
							if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
								event.preventDefault();
								moveFocus(pointIndex, 1);
							} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
								event.preventDefault();
								moveFocus(pointIndex, -1);
							} else if (event.key === 'Home') {
								event.preventDefault();
								moveFocus(pointIndex, -props.points.length);
							} else if (event.key === 'End') {
								event.preventDefault();
								moveFocus(pointIndex, props.points.length);
							}
						}}
					>
						<circle class="chart-point__halo" r={11} />
						<circle class="chart-point__dot" r={4.5} />
					</g>
				}
				<text class="axis-label" x={0} y={innerHeight + 28}>{props.points[0].label}</text>
				<text class="axis-label" text-anchor="end" x={innerWidth} y={innerHeight + 28}>
					{props.points.at(-1)?.label ?? ''}
				</text>
			</g>
		</svg>
		<div class="chart-reading" role="status" aria-live="polite">
			<span>
				<i aria-hidden="true"></i>
				{activePoint.label}
			</span>
			<strong>{formatInteger(activePoint.visitors)} visitors</strong>
			<small>{formatInteger(activePoint.conversions)} conversions</small>
		</div>
		<output class="measurement-chip" aria-label="Chart measured width">
			Measured at
			{width}
			px
		</output>
	</div>
}

function TrendPanel(props: {
	points: TrendPoint[];
	range: DateRange;
	pendingRange: DateRange | null;
	onRange: (range: DateRange) => void;
}) {
	return <section class="panel trend-panel" aria-labelledby="trend-heading">
		<header class="panel-heading">
			<div>
				<p class="eyebrow">Reach → activation</p>
				<h2 id="trend-heading">Visitor momentum</h2>
			</div>
			<div class="segmented-control" aria-label="Chart date range">
				@for (const option of ['7d', '30d'] as const; key option) {
					<button
						type="button"
						aria-pressed={props.range === option && props.pendingRange === null}
						onClick={() => props.onRange(option)}
					>
						{option === '7d' ? '7 days' : '30 days'}
					</button>
				}
			</div>
		</header>
		@if (props.pendingRange !== null) {
			<div class="chart-progress" role="status">
				Loading the
				{props.pendingRange === '7d' ? '7-day' : '30-day'}
				window…
			</div>
		}
		<div class="chart-measure-shell">
			<ParentSize
				className="chart-parent-size"
				debounceTime={0}
				initialSize={{ width: 760, height: CHART_HEIGHT }}
			>
				{({ width }) => <ChartFrame width={width} points={props.points} range={props.range} />}
			</ParentSize>
		</div>
		<p class="chart-help">
			Focus a point, then use arrow keys, Home, or End to inspect the series.
		</p>
	</section>;
}

const CAMPAIGN_COLUMNS: ColumnDef<CampaignRow>[] = [
	{ accessorKey: 'campaign', header: 'Campaign' },
	{ accessorKey: 'channel', header: 'Channel' },
	{
		accessorKey: 'sessions',
		header: 'Sessions',
		cell: (info) => formatInteger(info.getValue<number>()),
	},
	{
		accessorKey: 'conversionRate',
		header: 'Conversion',
		cell: (info) => `${info.getValue<number>().toFixed(1)}%`,
	},
	{
		accessorKey: 'revenue',
		header: 'Revenue',
		cell: (info) => formatCurrency(info.getValue<number>()),
	},
	{ accessorKey: 'status', header: 'Status' },
];

function CampaignTable() @{
	const [query, setQuery] = useState('');
	const table = useReactTable({
		data: CAMPAIGNS,
		columns: CAMPAIGN_COLUMNS,
		getRowId: (row) => row.id,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
	});
	const rows = table.getRowModel().rows;
	const selectedCount = table.getSelectedRowModel().rows.length;

	<section
		class="panel table-panel"
		id="campaign-table"
		tabIndex={-1}
		aria-labelledby="campaign-heading"
	>
		<header class="panel-heading table-heading">
			<div>
				<p class="eyebrow">Channel intelligence</p>
				<h2 id="campaign-heading">Campaign performance</h2>
				<p>{rows.length} of {CAMPAIGNS.length} campaigns · {selectedCount} selected</p>
			</div>
			<label class="search-field">
				<span aria-hidden="true">⌕</span>
				<span class="sr-only">Search campaigns</span>
				<input
					type="search"
					value={query}
					placeholder="Search campaign or channel"
					aria-label="Search campaigns"
					onInput={(event) => {
						const value = (event.currentTarget as HTMLInputElement).value;
						setQuery(value);
						table.setGlobalFilter(value);
					}}
				/>
			</label>
		</header>
		<div class="table-scroll">
			<table>
				<caption class="sr-only">Deterministic campaign performance report</caption>
				<thead>
					@for (const headerGroup of table.getHeaderGroups(); key headerGroup.id) {
						<tr>
							<th class="selection-cell" scope="col">
								<input
									type="checkbox"
									aria-label="Select all visible campaigns"
									checked={table.getIsAllRowsSelected()}
									onClick={table.getToggleAllRowsSelectedHandler()}
								/>
							</th>
							@for (const header of headerGroup.headers; key header.id) {
								<th
									scope="col"
									aria-sort={header.column.getIsSorted() === 'asc'
										? 'ascending'
										: header.column.getIsSorted() === 'desc'
											? 'descending'
											: 'none'}
								>
									<button
										type="button"
										onClick={header.column.getToggleSortingHandler()}
										aria-label={`Sort by ${String(header.column.columnDef.header)}`}
									>
										{header.isPlaceholder
											? null
											: flexRender(header.column.columnDef.header, header.getContext())}
										<span aria-hidden="true">
											{header.column.getIsSorted() === 'asc'
												? '↑'
												: header.column.getIsSorted() === 'desc'
													? '↓'
													: '↕'}
										</span>
									</button>
								</th>
							}
						</tr>
					}
				</thead>
				<tbody>
					@if (rows.length === 0) {
						<tr>
							<td class="table-empty" colSpan={CAMPAIGN_COLUMNS.length + 1}>
								<strong>No campaigns match “{query}”</strong>
								<span>Clear the search to return to the deterministic report.</span>
								<button
									type="button"
									onClick={() => {
										setQuery('');
										table.setGlobalFilter('');
									}}
								>Clear campaign search</button>
							</td>
						</tr>
					} @else {
						@for (const row of rows; key row.id) {
							<tr class={{ 'campaign-row': true, 'campaign-row--selected': row.getIsSelected() }}>
								<td class="selection-cell">
									<input
										type="checkbox"
										aria-label={`Select ${row.original.campaign}`}
										checked={row.getIsSelected()}
										onClick={row.getToggleSelectedHandler()}
									/>
								</td>
								@for (const cell of row.getVisibleCells(); key cell.id) {
									<td
										class={cell.column.id === 'status'
											? `status-cell status-cell--${String(cell.getValue()).toLowerCase()}`
											: undefined}
									>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
								}
							</tr>
						}
					}
				</tbody>
			</table>
		</div>
	</section>
}

function LogExplorer() @{
	const [level, setLevel] = useState<'all' | LogLevel>('all');
	const [announcement, setAnnouncement] = useState('360 events indexed');
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const visibleEvents = useMemo(
		() => level === 'all'
			? ACTIVITY_EVENTS
			: ACTIVITY_EVENTS.filter((event) => event.level === level),
		[level],
	);
	const virtualizer = useVirtualizer<HTMLDivElement, HTMLElement>({
		count: visibleEvents.length,
		getScrollElement: () => scrollRef.current,
		getItemKey: (index) => visibleEvents[index]?.id ?? index,
		estimateSize: LOG_ESTIMATE,
		overscan: 5,
		initialRect: { width: 760, height: 360 },
	});
	const virtualItems = virtualizer.getVirtualItems();

	const chooseLevel = (next: 'all' | LogLevel) => {
		setLevel(next);
		setAnnouncement(
			`${
				next === 'all'
					? ACTIVITY_EVENTS.length
					: ACTIVITY_EVENTS.filter((event) => event.level === next).length
			} ${next === 'all' ? '' : `${next} `}events indexed`,
		);
		window.requestAnimationFrame(() => virtualizer.scrollToIndex(0, { align: 'start' }));
	};

	const jumpToIncident = () => {
		setLevel('all');
		setAnnouncement('Checkout conversion spike selected');
		window.requestAnimationFrame(() => virtualizer.scrollToIndex(240, { align: 'center' }));
	};

	<section
		class="panel log-panel"
		id="live-activity"
		tabIndex={-1}
		aria-labelledby="activity-heading"
	>
		<header class="panel-heading log-heading">
			<div>
				<p class="eyebrow">Measured stream</p>
				<h2 id="activity-heading">Live activity</h2>
				<p>{visibleEvents.length} deterministic events in this view</p>
			</div>
			<button class="incident-button" type="button" onClick={jumpToIncident}>
				<span aria-hidden="true">◎</span>
				Jump to checkout spike
			</button>
		</header>
		<div class="log-toolbar" aria-label="Filter activity by severity">
			@for (const option of ['all', 'info', 'warning', 'error'] as const; key option) {
				<button type="button" aria-pressed={level === option} onClick={() => chooseLevel(option)}>
					{option === 'all' ? 'All events' : option[0].toUpperCase() + option.slice(1)}
				</button>
			}
			<output role="status" aria-live="polite">{announcement}</output>
		</div>
		<div
			class="log-window"
			ref={scrollRef}
			role="list"
			tabIndex={0}
			aria-label="Virtualized operational activity"
		>
			<div
				class="log-sizer"
				style={{ height: virtualizer.getTotalSize() + 'px', position: 'relative' }}
			>
				@for (const item of virtualItems; key item.key) {
					<article
						class={`log-entry log-entry--${visibleEvents[item.index].level}`}
						ref={virtualizer.measureElement}
						data-index={item.index}
						data-event-id={visibleEvents[item.index].id}
						role="listitem"
						aria-posinset={item.index + 1}
						aria-setsize={visibleEvents.length}
						style={{
							position: 'absolute',
							top: '0px',
							left: '0px',
							width: '100%',
							transform: `translateY(${item.start}px)`,
						}}
					>
						<time>{visibleEvents[item.index].time}</time>
						<span class="log-level">{visibleEvents[item.index].level}</span>
						<div>
							<strong>{visibleEvents[item.index].message}</strong>
							<small>{visibleEvents[item.index].detail}</small>
						</div>
						<code>{visibleEvents[item.index].service}</code>
					</article>
				}
			</div>
		</div>
	</section>
}

function EmptyDashboard({ onRestore }: { onRestore: () => void }) {
	return <section class="empty-dashboard" data-testid="empty-dashboard">
		<div class="empty-orbit" aria-hidden="true">
			<span></span>
			<i></i>
		</div>
		<p class="eyebrow">Quiet segment</p>
		<h1>No traffic in this segment</h1>
		<p>
			The selected fixture has no events yet. Restore Northstar’s sample signals to explore every
			report.
		</p>
		<button class="primary-button" type="button" onClick={onRestore}>Restore sample signals</button>
	</section>;
}

export function App() @{
	const [loadState, setLoadState] = useState<LoadState>('loading');
	const [view, setView] = useState<DashboardView>(readView);
	const [range, setRange] = useState<DateRange>(readRange);
	const [pendingRange, setPendingRange] = useState<DateRange | null>(null);
	const [refreshState, setRefreshState] = useState<RefreshState>('idle');
	const [revision, setRevision] = useState(1);
	const [empty, setEmpty] = useState(false);
	const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
	const [globalSearchQuery, setGlobalSearchQuery] = useState('');
	const [notificationsOpen, setNotificationsOpen] = useState(false);
	const [unreadNotifications, setUnreadNotifications] = useState(NOTIFICATIONS.length);
	const loadFailurePendingRef = useRef(scenarioSet().has('load-failure'));
	const refreshFailurePendingRef = useRef(scenarioSet().has('refresh-failure'));
	const loadTimerRef = useRef<number | null>(null);
	const rangeGenerationRef = useRef(0);
	const rangeTimerRef = useRef<number | null>(null);
	const refreshGenerationRef = useRef(0);
	const mobileNavigationButtonRef = useRef<HTMLButtonElement | null>(null);
	const normalizedSearchQuery = globalSearchQuery.trim().toLowerCase();
	const trendPoints = useMemo(() => trendFor(view, range), [view, range]);
	const searchResults =
		normalizedSearchQuery === ''
			? []
			: SEARCH_DESTINATIONS.filter(
					(destination) => `${destination.label} ${destination.description}`.toLowerCase().includes(
						normalizedSearchQuery,
					),
				);

	const loadDashboard = useCallback(() => {
		if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
		setLoadState('loading');
		loadTimerRef.current = window.setTimeout(() => {
			loadTimerRef.current = null;
			if (loadFailurePendingRef.current) {
				loadFailurePendingRef.current = false;
				setLoadState('error');
				return;
			}
			setEmpty(scenarioSet().has('empty'));
			setLoadState('ready');
		}, 260);
	}, []);

	useEffect(() => {
		loadDashboard();
		const onPopState = () => {
			rangeGenerationRef.current += 1;
			if (rangeTimerRef.current !== null) {
				window.clearTimeout(rangeTimerRef.current);
				rangeTimerRef.current = null;
			}
			setPendingRange(null);
			setView(readView());
			setRange(readRange());
		};
		window.addEventListener('popstate', onPopState);
		return () => {
			window.removeEventListener('popstate', onPopState);
			if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
			if (rangeTimerRef.current !== null) window.clearTimeout(rangeTimerRef.current);
		};
	}, []);

	useEffect(() => {
		if (!mobileNavigationOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			setMobileNavigationOpen(false);
			window.requestAnimationFrame(() => mobileNavigationButtonRef.current?.focus());
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [mobileNavigationOpen]);

	const navigate = (nextView: DashboardView) => {
		history.pushState(null, '', hrefFor(nextView, range));
		setView(nextView);
	};

	const openSearchDestination = (destination: SearchDestination) => {
		setGlobalSearchQuery('');
		if (destination.view !== undefined) {
			navigate(destination.view);
			return;
		}
		window.requestAnimationFrame(() => {
			const target = document.getElementById(destination.target ?? '');
			target?.scrollIntoView({ block: 'start' });
			target?.focus({ preventScroll: true });
		});
	};

	const changeRange = (nextRange: DateRange) => {
		if (rangeTimerRef.current !== null) window.clearTimeout(rangeTimerRef.current);
		const generation = ++rangeGenerationRef.current;
		setPendingRange(nextRange);
		const delay =
			generation % 3 === 1
				? 260
				: generation % 3 === 2
					? 150
					: 70;
		rangeTimerRef.current = window.setTimeout(() => {
			if (generation !== rangeGenerationRef.current) return;
			rangeTimerRef.current = null;
			setRange(nextRange);
			setPendingRange(null);
			history.replaceState(null, '', hrefFor(readView(), nextRange));
		}, delay);
	};

	const refresh = () => {
		const generation = ++refreshGenerationRef.current;
		setRefreshState('refreshing');
		window.setTimeout(() => {
			if (generation !== refreshGenerationRef.current) return;
			if (refreshFailurePendingRef.current) {
				refreshFailurePendingRef.current = false;
				setRefreshState('error');
				return;
			}
			setRevision((current) => current + 1);
			setRefreshState('idle');
		}, generation % 2 === 1 ? 240 : 90);
	};

	@if (loadState === 'loading') {
		<LoadingDashboard />
	} @else if (loadState === 'error') {
		<LoadFailure onRetry={loadDashboard} />
	} @else {
		<div class="app-shell" data-testid="pulseboard-ready">
			<a class="skip-link" href="#main-content">Skip to analytics</a>
			<Sidebar view={view} range={range} onNavigate={navigate} />
			<div class="workspace">
				<header class="topbar">
					<button
						class="mobile-brand"
						type="button"
						ref={mobileNavigationButtonRef}
						aria-label="Pulseboard navigation"
						aria-expanded={mobileNavigationOpen}
						aria-controls="mobile-navigation"
						onClick={() => {
							const next = !mobileNavigationOpen;
							setMobileNavigationOpen(next);
							if (next) window.requestAnimationFrame(() => {
								(document.querySelector('#mobile-navigation a') as HTMLElement | null)?.focus();
							});
						}}
					>
						<AppIcon />
					</button>
					<div class="global-search">
						<span aria-hidden="true">⌕</span>
						<label class="sr-only" for="pulseboard-search">Search Pulseboard</label>
						<input
							id="pulseboard-search"
							type="search"
							placeholder="Search reports"
							value={globalSearchQuery}
							aria-controls="pulseboard-search-results"
							aria-expanded={normalizedSearchQuery !== ''}
							onInput={(event) => setGlobalSearchQuery(event.currentTarget.value)}
							onKeyDown={(event) => {
								if (event.key === 'Escape') setGlobalSearchQuery('');
								if (event.key === 'Enter' && searchResults[0] !== undefined) {
									event.preventDefault();
									openSearchDestination(searchResults[0]);
								}
							}}
						/>
						@if (normalizedSearchQuery !== '') {
							<section
								class="global-search-results"
								id="pulseboard-search-results"
								aria-label="Pulseboard search results"
							>
								@if (searchResults.length === 0) {
									<p role="status">No reports match “{globalSearchQuery}”</p>
								} @else {
									@for (const destination of searchResults; key destination.id) {
										<button type="button" onClick={() => openSearchDestination(destination)}>
											<strong>{destination.label}</strong>
											<small>{destination.description}</small>
										</button>
									}
								}
							</section>
						}
					</div>
					<div class="topbar-actions">
						<button
							type="button"
							aria-label={`${
								notificationsOpen ? 'Close' : 'Open'
							} notifications, ${unreadNotifications} unread`}
							aria-expanded={notificationsOpen}
							aria-controls="pulseboard-notifications"
							onClick={() => setNotificationsOpen((open) => !open)}
						>
							♢
							@if (unreadNotifications > 0) {
								<span class="notification-badge">{String(unreadNotifications)}</span>
							}
						</button>
						<span class="user-avatar" aria-label="Signed in as Maya Chen">MC</span>
						@if (notificationsOpen) {
							<section
								class="notification-panel"
								id="pulseboard-notifications"
								aria-label="Notifications"
							>
								<header>
									<div>
										<strong>Notifications</strong>
										<small>{String(unreadNotifications)} unread</small>
									</div>
									@if (unreadNotifications > 0) {
										<button type="button" onClick={() => setUnreadNotifications(0)}>
											Mark all as read
										</button>
									}
								</header>
								@if (unreadNotifications === 0) {
									<p class="notification-empty" role="status">You’re all caught up</p>
								} @else {
									<ul>
										@for (const notification of NOTIFICATIONS; key notification.id) {
											<li>
												<strong>{notification.title}</strong>
												<small>{notification.detail}</small>
											</li>
										}
									</ul>
								}
							</section>
						}
					</div>
				</header>
				@if (mobileNavigationOpen) {
					<MobileNavigation
						view={view}
						range={range}
						onNavigate={(nextView) => {
							navigate(nextView);
							setMobileNavigationOpen(false);
						}}
						onClose={() => {
							setMobileNavigationOpen(false);
							window.requestAnimationFrame(() => mobileNavigationButtonRef.current?.focus());
						}}
					/>
				}
				<main id="main-content" tabIndex={-1}>
					@if (empty) {
						<EmptyDashboard onRestore={() => setEmpty(false)} />
					} @else {
						<>
							<section class="page-intro">
								<div>
									<p class="eyebrow">{VIEW_COPY[view].eyebrow}</p>
									<h1>{VIEW_COPY[view].title}</h1>
									<p>{VIEW_COPY[view].description}</p>
								</div>
								<div class="refresh-cluster">
									<span role="status" aria-live="polite">
										{refreshState === 'refreshing'
											? 'Refreshing snapshot…'
											: `Snapshot revision ${revision} · 14:32 UTC`}
									</span>
									<button type="button" onClick={refresh} disabled={refreshState === 'refreshing'}>
										↻ Refresh snapshot
									</button>
								</div>
							</section>
							@if (refreshState === 'error') {
								<div class="inline-alert" role="alert">
									<span aria-hidden="true">!</span>
									<div>
										<strong>Snapshot refresh paused</strong>
										<small>The existing analytics remain visible and unchanged.</small>
									</div>
									<button type="button" onClick={refresh}>Retry snapshot refresh</button>
								</div>
							}
							<MetricCards view={view} />
							<div class="dashboard-grid">
								<TrendPanel
									points={trendPoints}
									range={range}
									pendingRange={pendingRange}
									onRange={changeRange}
								/>
								<aside class="panel insight-panel" aria-labelledby="insight-heading">
									<p class="eyebrow">Pulse insight</p>
									<h2 id="insight-heading">Momentum is compounding</h2>
									<div class="score-ring">
										<span>
											<strong>84</strong>
											<small>signal score</small>
										</span>
									</div>
									<p>Activated teams are returning faster after the first shared report.</p>
									<ul>
										<li>
											<span>↗</span>
											<div>
												<strong>Mobile checkout</strong>
												<small>38% above baseline</small>
											</div>
										</li>
										<li>
											<span>◇</span>
											<div>
												<strong>Makers letter</strong>
												<small>Highest intent cohort</small>
											</div>
										</li>
									</ul>
								</aside>
							</div>
							<CampaignTable />
							<LogExplorer />
						</>
					}
				</main>
			</div>
		</div>
	}
}
