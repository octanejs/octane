// Small, real Octane components embedded throughout the Core APIs guide.
// Each demo keeps one concept tangible without depending on a backend.
import {
	use,
	useActionState,
	useDeferredValue,
	useEffect,
	useRef,
	useState,
	useTransition,
} from 'octane';

const demoStyles = <style>
	.demo {
		margin: 1rem 0 1.75rem;
		border: 1px solid var(--border);
		border-radius: 1rem;
		overflow: hidden;
		background: var(--panel);
	}
	.demo :global(.demo-bar) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid var(--border);
		color: var(--text-secondary);
		font-size: 0.78rem;
		font-weight: 650;
		letter-spacing: 0.02em;
	}
	.demo :global(.demo-bar-leading) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.demo :global(.demo-dot) {
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		background: #63d391;
		box-shadow: 0 0 0 4px rgba(99, 211, 145, 0.12);
	}
	.demo :global(.demo-preview) {
		padding: 1.5rem;
		background:
			radial-gradient(circle at 92% 12%, rgba(255, 65, 90, 0.14), transparent 32%), var(--panel);
	}
	.demo :global(.demo-copy) {
		margin-bottom: 1.25rem;
	}
	.demo :global(.demo-title) {
		margin: 0 0 0.15rem;
		color: var(--text);
		font-size: 1rem;
		font-weight: 750;
	}
	.demo :global(.demo-description) {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.875rem;
	}
	.demo :global(.demo-actions) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
	}
	.button {
		min-height: 2.5rem;
		border: 1px solid transparent;
		border-radius: 999px;
		padding: 0.5rem 1rem;
		font: inherit;
		font-size: 0.875rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	.primary {
		background: var(--accent);
		color: var(--on-accent);
	}
	.secondary {
		border-color: var(--border);
		background: rgba(255, 255, 255, 0.04);
		color: var(--text);
	}
	.disabled {
		opacity: 0.42;
		cursor: not-allowed;
	}
	.input {
		width: 100%;
		min-height: 2.75rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		padding: 0.6rem 0.8rem;
		background: rgba(22, 24, 29, 0.78);
		color: var(--text);
		font: inherit;
		font-size: 0.9rem;
	}
	.demo :global(.demo-status) {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.82rem;
	}
	.demo :global(.counter-layout) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
	}
	.demo :global(.demo-count) {
		min-width: 4.5rem;
		color: var(--text);
		font-size: clamp(2.75rem, 8vw, 4.5rem);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.08em;
		line-height: 1;
		text-align: right;
	}
	.demo :global(.packing-summary) {
		margin: 0 0 0.8rem;
		color: var(--text);
		font-size: 0.875rem;
		font-weight: 700;
	}
	.demo :global(.packing-list) {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		display: grid;
		gap: 0.45rem;
	}
	.demo :global(.packing-item) {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.75rem;
		min-height: 3rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		padding: 0.45rem 0.55rem 0.45rem 0.75rem;
		background: rgba(22, 24, 29, 0.48);
	}
	.demo :global(.packing-check) {
		width: 1.15rem;
		height: 1.15rem;
		margin: 0;
		accent-color: #63d391;
		cursor: pointer;
	}
	.demo :global(.packing-label) {
		cursor: pointer;
	}
	.packedLabel {
		color: var(--text-secondary);
		text-decoration: line-through;
	}
	.demo :global(.packing-empty) {
		border: 1px dashed var(--border);
		border-radius: 0.75rem;
		padding: 1.2rem;
		color: var(--text-secondary);
		text-align: center;
	}
	.demo :global(.shortcut-controls) {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: 0.75rem;
	}
	.demo :global(.demo-field) {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
		color: var(--text);
		font-size: 0.8rem;
		font-weight: 700;
	}
	.demo :global(.shortcut-note) {
		margin-top: 0.75rem;
	}
	.shortcutKey {
		display: inline-block;
		min-width: 1.5rem;
		border: 1px solid var(--border);
		border-bottom-color: rgba(255, 255, 255, 0.22);
		border-radius: 0.35rem;
		padding: 0.05rem 0.35rem;
		background: rgba(255, 255, 255, 0.06);
		color: var(--text);
		font-size: 0.75rem;
		text-align: center;
	}
	.demo :global(.data-stage) {
		display: grid;
		place-items: center;
		min-height: 9rem;
		margin-bottom: 1rem;
		border: 1px solid var(--border);
		border-radius: 0.875rem;
		padding: 1rem;
		background: rgba(22, 24, 29, 0.58);
	}
	.demo :global(.data-empty),
	.demo :global(.data-loading),
	.demo :global(.data-error) {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.875rem;
		text-align: center;
	}
	.demo :global(.data-loading) {
		color: var(--text);
	}
	.demo :global(.data-error) {
		color: #ff8797;
	}
	.demo :global(.profile-card) {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.9rem;
		width: min(100%, 24rem);
	}
	.demo :global(.profile-avatar) {
		display: grid;
		place-items: center;
		width: 3.25rem;
		height: 3.25rem;
		border-radius: 999px;
		background: rgba(255, 65, 90, 0.16);
		color: #ff8797;
		font-size: 1.1rem;
		font-weight: 800;
	}
	.demo :global(.profile-name),
	.demo :global(.profile-role) {
		display: block;
	}
	.demo :global(.profile-role) {
		color: var(--text-secondary);
		font-size: 0.82rem;
	}
	.demo :global(.profile-form) {
		display: grid;
		gap: 0.85rem;
	}
	.demo :global(.form-controls) {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: 0.75rem;
	}
	.demo :global(.form-result) {
		min-height: 1.35rem;
	}
	.demo :global(.demo-tabs) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-bottom: 0.85rem;
	}
	.demo :global(.demo-tab) {
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.45rem 0.8rem;
		background: rgba(255, 255, 255, 0.035);
		color: var(--text-secondary);
		font: inherit;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
	}
	.demo :global(.demo-tab-selected) {
		border-color: rgba(255, 65, 90, 0.48);
		background: rgba(255, 65, 90, 0.13);
		color: var(--text);
	}
	.demo :global(.demo-tab-pending) {
		border-color: rgba(255, 65, 90, 0.34);
		background: rgba(255, 65, 90, 0.07);
		color: var(--text);
		box-shadow: inset 0 0 0 1px rgba(255, 65, 90, 0.1);
	}
	.demo :global(.transition-status) {
		min-height: 1.25rem;
		margin: 0 0 0.65rem;
	}
	.demo :global(.report-card) {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 1rem;
		min-height: 7.5rem;
		border: 1px solid var(--border);
		border-radius: 0.85rem;
		padding: 1rem;
		background: rgba(22, 24, 29, 0.58);
	}
	.demo :global(.report-name),
	.demo :global(.report-detail),
	.demo :global(.report-metric) {
		margin: 0;
	}
	.demo :global(.report-name) {
		margin-bottom: 0.25rem;
		color: var(--text);
		font-size: 0.95rem;
		font-weight: 750;
	}
	.demo :global(.report-detail) {
		color: var(--text-secondary);
		font-size: 0.82rem;
	}
	.demo :global(.report-metric) {
		color: #8ae8ae;
		font-size: 1.8rem;
		font-weight: 800;
		letter-spacing: -0.04em;
	}
	.demo :global(.product-search) {
		display: grid;
		gap: 0.85rem;
	}
	.demo :global(.search-summary) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-height: 1.3rem;
	}
	.demo :global(.search-summary span) {
		color: var(--text-secondary);
		font-size: 0.8rem;
	}
	.demo :global(.search-updating) {
		color: #ff9baa;
		font-weight: 750;
	}
	.demo :global(.product-results) {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
		transition: opacity 0.15s;
	}
	.demo :global(.product-results[data-stale='true']) {
		opacity: 0.52;
	}
	.demo :global(.product-result) {
		border: 1px solid var(--border);
		border-radius: 0.7rem;
		padding: 0.7rem 0.8rem;
		background: rgba(22, 24, 29, 0.5);
		color: var(--text);
		font-size: 0.84rem;
	}
	.demo :global(.product-category) {
		display: block;
		margin-top: 0.15rem;
		color: var(--text-secondary);
	}
	.demo :global(.product-empty) {
		grid-column: 1 / -1;
		border: 1px dashed var(--border);
		border-radius: 0.7rem;
		padding: 1rem;
		color: var(--text-secondary);
		font-size: 0.84rem;
		text-align: center;
	}
	.success {
		color: #8ae8ae;
	}
	.error {
		color: #ff8797;
	}
	@media (max-width: 520px) {
		.demo :global(.demo-hint) {
			display: none;
		}
		.demo :global(.demo-preview) {
			padding: 1.25rem;
		}
		.demo :global(.counter-layout) {
			align-items: flex-end;
			flex-direction: column;
		}
		.counterActions,
		.demo :global(.shortcut-controls),
		.demo :global(.form-controls) {
			width: 100%;
			grid-template-columns: 1fr;
		}
		.counterActions {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.demo :global(.report-card),
		.demo :global(.product-results) {
			grid-template-columns: 1fr;
		}
		.demo :global(.report-metric) {
			font-size: 1.45rem;
		}
	}
</style>;

interface DemoFrameProps {
	id: string;
	title: string;
	description: string;
	hint: string;
	children: unknown;
}

function DemoFrame(props: DemoFrameProps) @{
	<section class={demoStyles.demo} data-demo={props.id} aria-labelledby={props.id + '-title'}>
		<div class="demo-bar">
			<div class="demo-bar-leading">
				<span class="demo-dot" aria-hidden="true"></span>
				<span class="demo-kicker">Live example</span>
			</div>
			<span class="demo-hint">
				{props.hint as string}
			</span>
		</div>
		<div class="demo-preview">
			<div class="demo-copy">
				<p id={props.id + '-title'} class="demo-title">
					{props.title as string}
				</p>
				<p class="demo-description">
					{props.description as string}
				</p>
			</div>
			{props.children}
		</div>
	</section>
}

export function CoreApiDemo() @{
	const [count, setCount] = useState(0);

	<DemoFrame
		id="state"
		title="Items packed"
		description="The number is state. Each click updates it and renders again."
		hint="Try the buttons"
	>
		<div class="counter-layout">
			<strong class="demo-count" aria-live="polite">{`${count}`}</strong>
			<div class={['demo-actions', demoStyles.counterActions]}>
				<button
					type="button"
					class={[
						'demo-button',
						demoStyles.button,
						demoStyles.secondary,
						count === 0 && demoStyles.disabled,
					]}
					disabled={count === 0}
					onClick={() => setCount((current) => Math.max(0, current - 1))}
				>
					Remove one
				</button>
				<button
					type="button"
					class={['demo-button', demoStyles.button, demoStyles.primary]}
					onClick={() => setCount((current) => current + 1)}
				>
					Add one
				</button>
			</div>
		</div>
	</DemoFrame>
}

interface PackingItem {
	id: number;
	label: string;
	packed: boolean;
}

const INITIAL_PACKING_ITEMS: PackingItem[] = [
	{ id: 1, label: 'Passport', packed: false },
	{ id: 2, label: 'Charger', packed: true },
	{ id: 3, label: 'Notebook', packed: false },
];

export function ListConditionsDemo() @{
	const [items, setItems] = useState<PackingItem[]>(INITIAL_PACKING_ITEMS);
	const packedCount = items.filter((item) => item.packed).length;
	const restoreItems = () => setItems(INITIAL_PACKING_ITEMS.map((item) => ({ ...item })));

	<DemoFrame
		id="lists"
		title="Packing list"
		description="The keyed list preserves each row while conditions update its status."
		hint="Pack or clear items"
	>
		<p class="packing-summary" aria-live="polite">
			@if (items.length === 0) {
				<span>Your list is empty.</span>
			} @else if (packedCount === items.length) {
				<span>Everything is packed.</span>
			} @else {
				<span>
					{packedCount + ' of ' + items.length + ' packed'}
				</span>
			}
		</p>
		<ul class="packing-list">
			@for (const item of items; key item.id) {
				<li class="packing-item">
					<input
						id={'packing-item-' + item.id}
						class="packing-check"
						type="checkbox"
						checked={item.packed}
						onInput={(event) => {
							const packed = (event.target as HTMLInputElement).checked;
							setItems(
								(current) => current.map(
									(currentItem) => currentItem.id === item.id
										? { ...currentItem, packed }
										: currentItem,
								),
							);
						}}
					/>
					<label
						for={'packing-item-' + item.id}
						class={['packing-label', item.packed && demoStyles.packedLabel]}
					>
						{item.label as string}
					</label>
				</li>
			} @empty {
				<li class="packing-empty">No items yet. Restore the list to keep packing.</li>
			}
		</ul>
		<div class="demo-actions">
			<button
				type="button"
				class={[
					'demo-button',
					demoStyles.button,
					demoStyles.secondary,
					items.length === 0 && demoStyles.disabled,
				]}
				disabled={items.length === 0}
				onClick={() => setItems([])}
			>
				Clear list
			</button>
			<button
				type="button"
				class={['demo-button', demoStyles.button, demoStyles.primary]}
				onClick={restoreItems}
			>
				Restore list
			</button>
		</div>
	</DemoFrame>
}

export function RefEffectDemo() @{
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [shortcutUsed, setShortcutUsed] = useState(false);

	useEffect(() => {
		const focusSearch = (event: KeyboardEvent) => {
			const target = event.target;
			const isEditable =
				target instanceof HTMLElement &&
					(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

			if (
				event.key !== '/' || event.altKey || event.ctrlKey || event.metaKey || event.isComposing ||
					isEditable
			) {
				return;
			}

			// Capture phase + stopPropagation so this page-local shortcut wins over the
			// global docs-search `/` handler (which listens on document during bubble
			// and would otherwise open the palette and steal focus from this input).
			event.preventDefault();
			event.stopPropagation();
			inputRef.current?.focus();
			setShortcutUsed(true);
		};

		window.addEventListener('keydown', focusSearch, true);
		return () => window.removeEventListener('keydown', focusSearch, true);
	});

	<DemoFrame
		id="refs-effects"
		title="Shortcut search"
		description="The ref points to the input; the effect owns a global keyboard subscription."
		hint="Press /"
	>
		<div class="shortcut-controls">
			<label class="demo-field" for="core-api-search">
				Search the guide
				<input
					id="core-api-search"
					ref={inputRef}
					class={['demo-input', demoStyles.input]}
					type="search"
					placeholder="Components, state, effects…"
					aria-keyshortcuts="/"
				/>
			</label>
			<button
				type="button"
				class={['demo-button', demoStyles.button, demoStyles.primary]}
				onClick={() => inputRef.current?.focus()}
			>
				Focus search
			</button>
		</div>
		<p class="demo-status shortcut-note" aria-live="polite">
			@if (shortcutUsed) {
				<span>The shortcut focused the search field.</span>
			} @else {
				<span>
					Press
					<kbd class={demoStyles.shortcutKey}>/</kbd>
					outside a form field, or use the button.
				</span>
			}
		</p>
	</DemoFrame>
}

interface DemoProfile {
	initials: string;
	name: string;
	role: string;
}

const DEMO_PROFILE: DemoProfile = {
	initials: 'AL',
	name: 'Ada Lovelace',
	role: 'Mathematician and programmer',
};

function loadDemoProfile(): Promise<DemoProfile> {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve(DEMO_PROFILE);
		}, 900);
	});
}

function ProfileResult(props: { request: Promise<DemoProfile> }) @{
	const profile = use(props.request);

	<article class="profile-card">
		<span class="profile-avatar" aria-hidden="true">
			{profile.initials as string}
		</span>
		<div>
			<strong class="profile-name">
				{profile.name as string}
			</strong>
			<span class="profile-role">
				{profile.role as string}
			</span>
		</div>
	</article>
}

function ProfileRequest(props: { request: Promise<DemoProfile> }) @{
	@try {
		<ProfileResult request={props.request} />
	} @pending {
		<p class="data-loading">Loading profile…</p>
	} @catch (error) {
		<p class="data-error">
			{error instanceof Error ? error.message : 'The request failed.'}
		</p>
	}
}

export function DataLoadingDemo() @{
	const [request, setRequest] = useState<Promise<DemoProfile> | null>(null);

	<DemoFrame
		id="data"
		title="Profile loader"
		description="The button creates one stable request; the boundary owns the pending UI."
		hint="Start a request"
	>
		<div class="data-stage" role="status" aria-atomic="true">
			@if (request) {
				<ProfileRequest request={request} />
			} @else {
				<p class="data-empty">Load the profile to see the boundary change.</p>
			}
		</div>
		<div class="demo-actions">
			<button
				type="button"
				class={['demo-button', demoStyles.button, demoStyles.primary]}
				onClick={() => setRequest(loadDemoProfile())}
			>
				Load profile
			</button>
		</div>
	</DemoFrame>
}

type DashboardTab = 'overview' | 'activity' | 'deployments';

interface DashboardReport {
	id: DashboardTab;
	label: string;
	detail: string;
	metric: string;
}

interface DashboardSelection {
	id: DashboardTab;
	value: DashboardReport | Promise<DashboardReport>;
}

const DASHBOARD_REPORTS: Record<DashboardTab, DashboardReport> = {
	overview: {
		id: 'overview',
		label: 'Overview',
		detail: 'Visitors across your active projects',
		metric: '24.8k',
	},
	activity: {
		id: 'activity',
		label: 'Activity',
		detail: 'Team changes during the last seven days',
		metric: '184',
	},
	deployments: {
		id: 'deployments',
		label: 'Deployments',
		detail: 'Successful production releases this month',
		metric: '32',
	},
};

const DASHBOARD_TABS: DashboardTab[] = ['overview', 'activity', 'deployments'];

function loadDashboardReport(id: DashboardTab): Promise<DashboardReport> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(DASHBOARD_REPORTS[id]), 700);
	});
}

function DashboardReportPanel(props: { value: DashboardReport | Promise<DashboardReport> }) @{
	const report =
		props.value instanceof Promise ? use(props.value) : props.value;

	<article
		class="report-card"
		role="tabpanel"
		aria-labelledby={'dashboard-tab-' + report.id}
		data-report={report.id}
	>
		<div>
			<p class="report-name">
				{report.label as string}
			</p>
			<p class="report-detail">
				{report.detail as string}
			</p>
		</div>
		<p class="report-metric">
			{report.metric as string}
		</p>
	</article>
}

export function TransitionDemo() @{
	const [selection, setSelection] = useState<DashboardSelection>({
		id: 'overview',
		value: DASHBOARD_REPORTS.overview,
	});
	const [isPending, startTransition] = useTransition();
	const pendingTab = useRef<DashboardTab | null>(null);
	const isLoading = isPending && pendingTab.current !== null;

	const openReport = (next: DashboardTab) => {
		if (selection.id === next || pendingTab.current !== null) return;

		const request = loadDashboardReport(next);
		pendingTab.current = next;
		startTransition(async () => {
			setSelection({ id: next, value: request });
			await request;
			pendingTab.current = null;
		});
	};

	<DemoFrame
		id="transition"
		title="Project dashboard"
		description="Open another report. The current one stays useful while its data loads."
		hint="Try Activity"
	>
		<section aria-busy={isLoading}>
			<div class="demo-tabs" role="tablist" aria-label="Project reports">
				@for (const tab of DASHBOARD_TABS; key tab) {
					<button
						id={'dashboard-tab-' + tab}
						type="button"
						class={[
							'demo-tab',
							selection.id === tab && 'demo-tab-selected',
							isLoading && pendingTab.current === tab && 'demo-tab-pending',
						]}
						role="tab"
						aria-selected={selection.id === tab}
						disabled={isLoading}
						onClick={() => openReport(tab)}
					>
						{DASHBOARD_REPORTS[tab].label as string}
					</button>
				}
			</div>
			<p class="demo-status transition-status" aria-live="polite">
				@if (isLoading && pendingTab.current !== null) {
					<span>
						{'Loading ' + DASHBOARD_REPORTS[pendingTab.current].label + ' — ' +
							DASHBOARD_REPORTS[selection.id].label +
							' stays on screen.'}
					</span>
				} @else {
					<span>
						{DASHBOARD_REPORTS[selection.id].label + ' is ready.'}
					</span>
				}
			</p>
			@try {
				<DashboardReportPanel value={selection.value} />
			} @pending {
				<p class="data-loading">Loading the first report…</p>
			}
		</section>
	</DemoFrame>
}

interface DemoProduct {
	id: number;
	name: string;
	category: string;
}

const DEMO_PRODUCTS: DemoProduct[] = [
	{ id: 1, name: 'Pocket camera', category: 'Photography' },
	{ id: 2, name: 'Camera shoulder bag', category: 'Photography' },
	{ id: 3, name: 'Oak standing desk', category: 'Workspace' },
	{ id: 4, name: 'Desk task lamp', category: 'Workspace' },
	{ id: 5, name: 'Travel headphones', category: 'Audio' },
	{ id: 6, name: 'Studio microphone', category: 'Audio' },
];

const productSearchCache = new Map<string, Promise<DemoProduct[]>>();

function searchDemoProducts(query: string): Promise<DemoProduct[]> {
	const normalized = query.trim().toLowerCase();
	let request = productSearchCache.get(normalized);
	if (!request) {
		request = new Promise((resolve) => {
			setTimeout(() => {
				resolve(
					DEMO_PRODUCTS.filter(
						(product) => (product.name + ' ' + product.category).toLowerCase().includes(normalized),
					),
				);
			}, 650);
		});
		productSearchCache.set(normalized, request);
	}
	return request;
}

function ProductResults(props: { query: string; isStale: boolean }) @{
	const products =
		props.query === '' ? DEMO_PRODUCTS : use(searchDemoProducts(props.query));
	const visibleQuery =
		props.query === '' ? 'all products' : '“' + props.query + '”';

	<section aria-busy={props.isStale}>
		<div class="search-summary" aria-live="polite">
			<span>
				{'Showing results for ' + visibleQuery}
			</span>
			@if (props.isStale) {
				<strong class="search-updating">Updating…</strong>
			}
		</div>
		<ul class="product-results" data-stale={props.isStale}>
			@for (const product of products; key product.id) {
				<li class="product-result">
					{product.name as string}
					<small class="product-category">
						{'Category: ' + product.category}
					</small>
				</li>
			} @empty {
				<li class="product-empty">No products match this search.</li>
			}
		</ul>
	</section>
}

function DeferredProductResults(props: { query: string; isStale: boolean }) @{
	@try {
		<ProductResults query={props.query} isStale={props.isStale} />
	} @pending {
		<p class="data-loading">Searching the catalogue…</p>
	}
}

export function DeferredSearchDemo() @{
	const [query, setQuery] = useState('');
	const deferredQuery = useDeferredValue(query);
	const isStale = query !== deferredQuery;

	<DemoFrame
		id="deferred-value"
		title="Product search"
		description="The search box stays immediate while the slower result view catches up."
		hint="Type camera or desk"
	>
		<div class="product-search">
			<label class="demo-field" for="core-api-product-search">
				Search products
				<input
					id="core-api-product-search"
					class={['demo-input', demoStyles.input]}
					type="search"
					value={query}
					placeholder="Try camera or desk"
					onInput={(event) => setQuery(event.currentTarget.value)}
				/>
			</label>
			<DeferredProductResults query={deferredQuery} isStale={isStale} />
		</div>
	</DemoFrame>
}

interface SaveNameResult {
	status: 'idle' | 'success' | 'error';
	message: string;
}

const INITIAL_SAVE_RESULT: SaveNameResult = {
	status: 'idle',
	message: 'Save the name above, or clear it to try validation.',
};

async function saveDemoName(
	_previousResult: SaveNameResult,
	formData: FormData,
): Promise<SaveNameResult> {
	const name = String(formData.get('name') ?? '').trim();
	if (!name) return { status: 'error', message: 'Enter a name before saving.' };

	await new Promise((resolve) => setTimeout(resolve, 450));
	return { status: 'success', message: 'Saved ' + name + '.' };
}

export function FormActionDemo() @{
	const [result, submit, isPending] = useActionState(saveDemoName, INITIAL_SAVE_RESULT);

	<DemoFrame
		id="form"
		title="Async form action"
		description="Save the prefilled name to see pending and success states, or clear it to see validation."
		hint="Try both paths"
	>
		<form class="profile-form" action={submit} aria-busy={isPending}>
			<div class="form-controls">
				<label class="demo-field" for="core-api-profile-name">
					Name
					<input
						id="core-api-profile-name"
						class={['demo-input', demoStyles.input]}
						name="name"
						autoComplete="name"
						defaultValue="Ada Lovelace"
					/>
				</label>
				<button
					type="submit"
					class={[
						'demo-button',
						demoStyles.button,
						demoStyles.primary,
						isPending && demoStyles.disabled,
					]}
					disabled={isPending}
				>
					{isPending ? 'Saving…' : 'Save name'}
				</button>
			</div>
			<p
				class={[
					'demo-status',
					'form-result',
					result.status === 'success' && demoStyles.success,
					result.status === 'error' && demoStyles.error,
				]}
				aria-live="polite"
			>
				{result.message as string}
			</p>
		</form>
	</DemoFrame>
}
