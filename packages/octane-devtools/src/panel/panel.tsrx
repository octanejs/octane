// The devtools panel UI — an ordinary Octane application (dogfooding), mounted
// by ./mount.ts into a shadow-DOM host whose container is marked internal on
// the bridge, so the panel never inspects itself.
//
// Refresh model: the bridge attributes commit events to public roots and no
// longer emits commits caused only by internal (panel-owned) roots, so the
// panel does not hear its own renders. It still NEVER sets state directly
// from `subscribe`: while open it schedules a trailing throttled refresh that
// re-reads the tree, fingerprints it, and only calls setState when the
// fingerprint actually changed — a cheap defensive guard that keeps the loop
// terminating even if an embedder surfaces extra commit events.
//
// Layout (trigger position, dock height, pin) is panel-local state persisted
// in localStorage — it never touches the bridge, so it cannot feed the refresh
// loop; drags mutate the DOM directly and commit state + storage on release.
// The dock is a bottom drawer only.
import { useCallback, useEffect, useRef, useState, version } from 'octane';
import type {
	DevtoolsEvent,
	DevtoolsInstanceDetail,
	DevtoolsSourceLocation,
	DevtoolsTreeNode,
	OctaneDevtools,
} from 'octane/devtools';
import type { OctaneProfiler, ProfileSummary } from 'octane/profiling';
import {
	describeEvent,
	findNodePath,
	formatMs,
	formatSource,
	shortFile,
	shortSource,
} from '../format.js';
import { buildAgentPrompt } from '../prompt.js';
import { formatValuePreview, serializeValue } from '../serialize.js';
import { buildSnapshot } from '../snapshot.js';
import { clearHighlight, highlightNodes } from './highlight.js';
import { getPanelSourcePrefix } from './mount.js';
import { getDevtoolsPanelPlugins, subscribeDevtoolsPanelPlugins } from './plugin-registry.js';
import type { DevtoolsPanelPlugin } from './plugin-registry.js';

export interface PanelOptions {
	position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
	openByDefault?: boolean;
}

export interface PanelProps {
	hook: OctaneDevtools;
	options?: PanelOptions;
}

type TabId = 'components' | 'performance' | 'timeline' | 'settings';

/** The panel's name for a profiler aggregation row. */
interface ProfilerSummaryRow extends ProfileSummary {}

interface TriggerPos {
	x: number;
	y: number;
}

/** Persisted dock layout: pin flag and drawer height override (px). */
interface DockPrefs {
	pinned: boolean;
	height?: number;
}

const REFRESH_THROTTLE_MS = 300;
const COPIED_FLASH_MS = 1500;
const DEFAULT_EXPANDED_DEPTH = 3;
const TRIGGER_STORAGE_KEY = 'octane-devtools:trigger';
const DOCK_STORAGE_KEY = 'octane-devtools:dock';
const DRAG_THRESHOLD_PX = 4;
const EDGE_MARGIN_PX = 12;
const DOCK_MIN_HEIGHT_PX = 220;
const DOCK_COLLAPSED_PX = 8;
const AUTO_HIDE_DELAY_MS = 400;
const DOCK_CLOSE_MS = 200;
const EVENT_KINDS = ['commit', 'effect', 'hmr', 'root-added', 'root-removed'];
const TABS: { id: TabId; label: string }[] = [
	{ id: 'components', label: 'Components' },
	{ id: 'performance', label: 'Performance' },
	{ id: 'timeline', label: 'Timeline' },
	{ id: 'settings', label: 'Settings' },
];

/** The typed bridge profiler, normalized to null when not installed. */
function resolveProfiler(hook: OctaneDevtools): OctaneProfiler | null {
	return hook.getProfiler() ?? null;
}

function openInEditor(source: DevtoolsSourceLocation | null): void {
	if (source === null) return;
	try {
		fetch(
			'/__open-in-editor?file=' +
				encodeURIComponent(source.file + ':' + source.line + ':' + source.column),
		).catch(() => {});
	} catch {
		// No fetch in this environment — the button is best-effort only.
	}
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2) ?? 'undefined';
	} catch {
		return '(unserializable)';
	}
}

/**
 * Cheap change detector: the tree is inert JSON already; the selected detail
 * goes through `serializeValue` (depth/size-bounded, never throws) so live
 * props/hook values compare structurally instead of by identity.
 */
function computeFingerprint(
	tree: DevtoolsTreeNode[],
	detail: DevtoolsInstanceDetail | null,
): string {
	// The tree is inert JSON and the detail is depth-bounded by serializeValue,
	// so the only real escape is the engine refusing a colossal result string
	// (RangeError). A constant fallback then forces refreshes through.
	try {
		return JSON.stringify(tree) + '|' +
			(detail === null ? 'null' : JSON.stringify(serializeValue(detail)));
	} catch {
		return '(unfingerprintable)';
	}
}

function computeVisibleIds(tree: DevtoolsTreeNode[], query: string): Set<number> {
	const visible = new Set<number>();
	const walk = (node: DevtoolsTreeNode): boolean => {
		let matched = node.label.toLowerCase().includes(query);
		for (const child of node.children) {
			if (walk(child)) matched = true;
		}
		if (matched) visible.add(node.id);
		return matched;
	};
	for (const rootNode of tree) walk(rootNode);
	return visible;
}

function copyViaTextarea(text: string): void {
	try {
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.setAttribute('readonly', '');
		textarea.style.position = 'fixed';
		textarea.style.opacity = '0';
		document.body.appendChild(textarea);
		textarea.select();
		document.execCommand('copy');
		textarea.remove();
	} catch {
		// Clipboard access denied — nothing further to do.
	}
}

function copyText(text: string): void {
	try {
		if (
			typeof navigator !== 'undefined' && navigator.clipboard !== undefined &&
				typeof navigator.clipboard.writeText === 'function'
		) {
			navigator.clipboard.writeText(text).catch(() => copyViaTextarea(text));
			return;
		}
	} catch {
		// Fall through to the hidden-textarea path.
	}
	copyViaTextarea(text);
}

/** Trigger size, with fixed fallbacks for unmeasurable layouts (jsdom). */
function measureTrigger(el: HTMLElement | null): { width: number; height: number } {
	const rect =
		el !== null ? el.getBoundingClientRect() : null;
	return {
		width: rect !== null && rect.width > 0 ? rect.width : 96,
		height: rect !== null && rect.height > 0 ? rect.height : 28,
	};
}

function clampTriggerPosition(x: number, y: number, el: HTMLElement | null): TriggerPos {
	if (typeof window === 'undefined') return { x, y };
	const { width, height } = measureTrigger(el);
	const maxX = Math.max(EDGE_MARGIN_PX, window.innerWidth - width - EDGE_MARGIN_PX);
	const maxY = Math.max(EDGE_MARGIN_PX, window.innerHeight - height - EDGE_MARGIN_PX);
	return {
		x: Math.round(Math.min(Math.max(x, EDGE_MARGIN_PX), maxX)),
		y: Math.round(Math.min(Math.max(y, EDGE_MARGIN_PX), maxY)),
	};
}

/** Snap a released drag position to the nearest screen edge (small margin). */
function snapTriggerToEdge(x: number, y: number, el: HTMLElement | null): TriggerPos {
	const clamped = clampTriggerPosition(x, y, el);
	if (typeof window === 'undefined') return clamped;
	const { width, height } = measureTrigger(el);
	const distanceLeft = clamped.x;
	const distanceRight = window.innerWidth - (clamped.x + width);
	const distanceTop = clamped.y;
	const distanceBottom = window.innerHeight - (clamped.y + height);
	const nearest = Math.min(distanceLeft, distanceRight, distanceTop, distanceBottom);
	if (nearest === distanceLeft) return { x: EDGE_MARGIN_PX, y: clamped.y };
	if (nearest === distanceRight) {
		return { x: Math.round(window.innerWidth - width - EDGE_MARGIN_PX), y: clamped.y };
	}
	if (nearest === distanceTop) return { x: clamped.x, y: EDGE_MARGIN_PX };
	return { x: clamped.x, y: Math.round(window.innerHeight - height - EDGE_MARGIN_PX) };
}

function readTriggerStorage(): TriggerPos | null {
	try {
		const raw = localStorage.getItem(TRIGGER_STORAGE_KEY);
		if (raw === null) return null;
		const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown } | null;
		if (
			parsed === null || typeof parsed !== 'object' || typeof parsed.x !== 'number' ||
				!Number.isFinite(parsed.x) ||
				typeof parsed.y !== 'number' ||
				!Number.isFinite(parsed.y)
		) {
			return null;
		}
		return clampTriggerPosition(parsed.x, parsed.y, null);
	} catch {
		return null;
	}
}

function writeTriggerStorage(position: TriggerPos): void {
	try {
		localStorage.setItem(TRIGGER_STORAGE_KEY, JSON.stringify(position));
	} catch {
		// Storage unavailable (private mode, hardened host) — stay in-memory.
	}
}

function readDockStorage(): DockPrefs {
	const defaults: DockPrefs = { pinned: true };
	try {
		const raw = localStorage.getItem(DOCK_STORAGE_KEY);
		if (raw === null) return defaults;
		// Read defensively: older records carried `{ mode, sizes }` from the
		// removed sidebar capability — take the bottom height, ignore the rest.
		const parsed = JSON.parse(raw) as
			| {
					pinned?: unknown;
					height?: unknown;
					sizes?: Record<string, unknown> | null;
			  }
			| null;
		if (parsed === null || typeof parsed !== 'object') return defaults;
		const legacyHeight =
			parsed.sizes !== null && parsed.sizes !== undefined && typeof parsed.sizes === 'object'
				? parsed.sizes['bottom']
				: undefined;
		const height =
			typeof parsed.height === 'number' && Number.isFinite(parsed.height)
				? parsed.height
				: typeof legacyHeight === 'number' && Number.isFinite(legacyHeight)
					? legacyHeight
					: undefined;
		return {
			pinned: parsed.pinned !== false,
			...(height !== undefined ? { height } : null),
		};
	} catch {
		return defaults;
	}
}

function writeDockStorage(prefs: DockPrefs): void {
	try {
		localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(prefs));
	} catch {
		// Storage unavailable — the layout still applies for this session.
	}
}

function dockDefaultHeight(): number {
	return typeof window === 'undefined' ? 360 : Math.round(window.innerHeight * 0.45);
}

function clampDockHeight(height: number): number {
	const limit =
		typeof window === 'undefined' ? 10000 : Math.max(DOCK_MIN_HEIGHT_PX, window.innerHeight * 0.9);
	return Math.round(Math.min(Math.max(height, DOCK_MIN_HEIGHT_PX), limit));
}

// The Octane flame mark, inlined from website/public/favicon.svg (the inner
// flame only — the dark chip behind it stays out of the panel).
function OctaneMark(props: { size: number }) @{
	<svg class="logo" width={props.size} height={props.size} viewBox="-13 0 107 108" fill="none">
		<path
			d="M71.0265 37.6009L65.8601 32.48C57.4266 24.1187 52.5193 13.6179 49.6691 1.55156C49.1892 -0.480713 46.2849 -0.534311 45.796 1.49572C43.135 12.5571 39.0884 21.441 31.9122 28.5539L29.1656 31.2763L32.1217 32.6051C34.5258 33.686 36.646 34.9098 38.604 36.3458C40.1609 37.487 41.4587 38.751 42.5898 40.0798L46.9068 35.8031L59.8758 48.6555C67.025 55.7439 67.025 67.2742 59.8758 74.3626L47.0622 87.0609C43.5969 90.4957 38.9915 92.385 34.0932 92.385C29.1949 92.385 24.5895 90.4935 21.1242 87.0609C13.975 79.9726 13.975 68.4422 21.1242 61.3539L26.4529 56.0722C27.6921 53.5084 29.6118 50.1138 31.1844 45.7858C32.4101 42.4136 31.8266 38.8649 29.4653 36.0733L27.1198 33.3041L9.97348 50.2992C-3.32449 63.4822 -3.32449 84.9304 9.97348 98.1133C16.6225 104.706 25.3578 108 34.0932 108C42.8286 108 51.564 104.704 58.213 98.1133L71.0265 85.415C84.3245 72.2321 84.3245 50.7838 71.0265 37.5986V37.6009Z"
			fill="#F4EEE8"
		/>
		<path
			d="M53.682 51.4605C56.0095 56.1079 55.4237 66.6802 46.9654 65.3715C45.0232 65.07 43.2928 64.0941 42.7183 61.8943C42.3578 60.5097 43.3131 58.2697 43.7705 56.9387C46.481 49.0441 43.0923 42.4136 37.2657 38.1413C35.5736 36.9019 33.6314 35.7384 31.1913 34.6396C34.0595 38.0274 34.8684 42.3801 33.2732 46.6277C32.3224 48.9481 31.0606 51.3958 29.9543 53.6514C27.9671 57.7047 26.3178 62.504 27.575 69.1591C28.1879 72.4063 30.2743 75.0706 32.2503 76.9532C26.4259 77.6522 24.1886 73.811 23.0305 72.1986C21.7935 70.4767 20.9328 66.0973 22.7173 62.935C16.4491 69.1502 16.4491 79.2669 22.7173 85.4843C25.759 88.4969 29.7989 90.154 34.0933 90.154C38.3878 90.154 42.4276 88.4969 45.4694 85.4843L56.6562 74.3984C63.0663 67.8527 61.0543 58.7722 53.6798 51.4628L53.682 51.4605Z"
			fill="#FF415A"
		/>
	</svg>
}

// Minimal stroke-based thumbtack: inherits the button color via currentColor,
// so the pinned/unpinned states are pure CSS.
function PinIcon(props: { size: number }) @{
	<svg
		width={props.size}
		height={props.size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.8"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M9 3h6M10 3v5l-3 3v2h10v-2l-3-3V3M12 13v8" />
	</svg>
}

interface TreeRowProps {
	node: DevtoolsTreeNode;
	depth: number;
	selectedId: number | null;
	/** The node the element picker is currently hovering, if any. */
	pickerHoverId: number | null;
	/** Non-null while the filter box is active: the ids on paths to matches. */
	visibleIds: ReadonlySet<number> | null;
	overrides: Record<number, boolean>;
	onToggle: (id: number, depth: number) => void;
	onSelect: (id: number) => void;
	onHover: (id: number, label: string) => void;
	onLeave: () => void;
}

function TreeRow(props: TreeRowProps) @{
	const node = props.node;
	const filtering = props.visibleIds !== null;
	const expanded = filtering
		? true
		: props.overrides[node.id] ?? props.depth < DEFAULT_EXPANDED_DEPTH;
	const children =
		filtering
			? node.children.filter((child) => props.visibleIds !== null && props.visibleIds.has(child.id))
			: node.children;

	<div>
		<div
			class={[
				'tree-row',
				'type-' + node.type,
				{
					selected: props.selectedId === node.id,
					'picker-hover': props.pickerHoverId === node.id,
				},
			]}
			data-node-id={String(node.id)}
			style={{ paddingLeft: 8 + props.depth * 14 + 'px' }}
			onClick={() => props.onSelect(node.id)}
			onMouseEnter={() => props.onHover(node.id, node.label)}
			onMouseLeave={() => props.onLeave()}
		>
			@if (node.children.length > 0) {
				<button
					class="caret"
					onClick={(event: MouseEvent) => {
						event.stopPropagation();
						props.onToggle(node.id, props.depth);
					}}
				>
					{(expanded ? '▾' : '▸') as string}
				</button>
			} @else {
				<span class="caret-spacer"></span>
			}
			<span class="tree-label">
				{node.label as string}
			</span>
			@if (node.key !== null) {
				<span class="badge badge-key">
					{'key=' + node.key as string}
				</span>
			}
			@if (node.lite) {
				<span class="badge">lite</span>
			}
			@if (node.pending) {
				<span class="badge badge-pending">pending</span>
			}
			@if (node.inactive) {
				<span class="badge badge-inactive">inactive</span>
			}
		</div>
		@if (expanded && children.length > 0) {
			<div>
				@for (const child of children; key child.id) {
					<TreeRow
						node={child}
						depth={props.depth + 1}
						selectedId={props.selectedId}
						pickerHoverId={props.pickerHoverId}
						visibleIds={props.visibleIds}
						overrides={props.overrides}
						onToggle={props.onToggle}
						onSelect={props.onSelect}
						onHover={props.onHover}
						onLeave={props.onLeave}
					/>
				}
			</div>
		}
	</div>
}

export function Panel(props: PanelProps) @{
	const { hook, options } = props;
	const position =
		options !== undefined && options.position !== undefined ? options.position : 'bottom-right';

	const [open, setOpen] = useState(options !== undefined && options.openByDefault === true);
	// Builtin TabId or a registered plugin tab ('plugin:<id>').
	const [tab, setTab] = useState<string>('components');
	const [plugins, setPlugins] = useState<DevtoolsPanelPlugin[]>(getDevtoolsPanelPlugins());
	useEffect(() => subscribeDevtoolsPanelPlugins(() => setPlugins(getDevtoolsPanelPlugins())), []);
	const [, setRefreshTick] = useState(0);
	const treeRef = useRef<DevtoolsTreeNode[]>([]);
	const detailRef = useRef<DevtoolsInstanceDetail | null>(null);
	const fingerprintRef = useRef('');
	const [selectedId, setSelectedId, getSelectedId] = useState<number | null>(null);
	const [filter, setFilter] = useState('');
	const [expandedOverrides, setExpandedOverrides] = useState<Record<number, boolean>>({});
	const [issue, setIssue] = useState('');
	const [copied, setCopied] = useState<string | null>(null);
	const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [events, setEvents] = useState<DevtoolsEvent[]>([]);
	const [eventFilters, setEventFilters] = useState<Record<string, boolean>>({});
	const [effectTelemetry, setEffectTelemetry] = useState(hook.isEffectTelemetryEnabled());
	const [eventRecording, setEventRecording] = useState(hook.isRecording());
	const [perfRows, setPerfRows] = useState<ProfilerSummaryRow[] | null>(null);
	const [perfRecording, setPerfRecording] = useState(true);
	// Layout-independent self-exclusion prefix for the perf table, computed
	// once per mount from the panel's own compiler-registered source.
	const [panelSourcePrefix] = useState<string | null>(() => getPanelSourcePrefix(hook));
	// The raw-props <details> disclosure; the pretty JSON is built only while open.
	const [rawPropsOpen, setRawPropsOpen] = useState(false);

	// Layout: trigger position, dock mode/size/pin, auto-hide. Panel-local
	// state persisted in localStorage; never touches the bridge.
	const triggerRef = useRef<HTMLElement | null>(null);
	const dockRef = useRef<HTMLElement | null>(null);
	const suppressClickRef = useRef(false);
	const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [triggerPos, setTriggerPos] = useState<TriggerPos | null>(readTriggerStorage);
	const [dockPrefs, setDockPrefs, getDockPrefs] = useState<DockPrefs>(readDockStorage);
	const [collapsed, setCollapsed] = useState(false);
	// Exit animation: `closing` keeps the dock mounted with the slide-out class
	// until a timer removes it (jsdom never fires transitionend, so a timer).
	const [closing, setClosing] = useState(false);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Element picker: `picking` gates the window listeners entirely (zero work
	// when off); the hovered id lives in a ref plus one small state so a hover
	// re-renders rows without rebuilding tree data or touching the bridge tree.
	const [picking, setPicking] = useState(false);
	const [pickerHoverId, setPickerHoverId] = useState<number | null>(null);
	const pickerHoverRef = useRef<number | null>(null);

	const refresh = useCallback(() => {
		const nextTree = hook.getTree();
		const selected = getSelectedId();
		const nextDetail =
			selected === null ? null : hook.inspect(selected);
		const fingerprint = computeFingerprint(nextTree, nextDetail);
		if (fingerprint === fingerprintRef.current) return;
		fingerprintRef.current = fingerprint;
		treeRef.current = nextTree;
		detailRef.current = nextDetail;
		setRefreshTick((tick) => tick + 1);
	});

	// Subscribe only while open; trailing throttle, deduped by the pending timer.
	useEffect(() => {
		if (!open) return;
		refresh();
		let pendingTimer: ReturnType<typeof setTimeout> | null = null;
		const unsubscribe = hook.subscribe((event) => {
			if (
				event.kind !== 'commit' && event.kind !== 'root-added' && event.kind !== 'root-removed' &&
					event.kind !== 'hmr'
			) {
				return;
			}
			if (pendingTimer !== null) return;
			pendingTimer = setTimeout(() => {
				pendingTimer = null;
				refresh();
			}, REFRESH_THROTTLE_MS);
		});
		return () => {
			unsubscribe();
			if (pendingTimer !== null) clearTimeout(pendingTimer);
		};
	}, [open, hook, refresh]);

	useEffect(
		() => () => {
			clearHighlight();
			if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
			if (hideTimer.current !== null) clearTimeout(hideTimer.current);
			if (closeTimer.current !== null) clearTimeout(closeTimer.current);
		},
		[],
	);

	// Re-clamp the floating trigger when the viewport shrinks.
	useEffect(() => {
		if (typeof window === 'undefined') return;
		const onResize = () => {
			setTriggerPos((current) => {
				if (current === null) return current;
				const next = clampTriggerPosition(current.x, current.y, triggerRef.current);
				return next.x === current.x && next.y === current.y ? current : next;
			});
		};
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, []);

	const cancelHide = () => {
		if (hideTimer.current !== null) {
			clearTimeout(hideTimer.current);
			hideTimer.current = null;
		}
	};

	const cancelClose = () => {
		if (closeTimer.current !== null) {
			clearTimeout(closeTimer.current);
			closeTimer.current = null;
		}
	};

	const toggleOpen = () => {
		cancelHide();
		if (!open) {
			refresh();
			cancelClose();
			setClosing(false);
			setCollapsed(false);
			setOpen(true);
			return;
		}
		if (closing) {
			// Re-toggled mid-close: cancel the exit and stay open.
			cancelClose();
			setClosing(false);
			refresh();
			return;
		}
		clearHighlight();
		if (picking) stopPicking();
		setClosing(true);
		closeTimer.current = setTimeout(() => {
			closeTimer.current = null;
			setClosing(false);
			setCollapsed(false);
			setOpen(false);
		}, DOCK_CLOSE_MS);
	};

	// Distinguishes a drag-release's synthetic click from a deliberate toggle.
	const onTriggerClick = () => {
		if (suppressClickRef.current) return;
		toggleOpen();
	};

	const startTriggerDrag = (event: PointerEvent) => {
		if (event.button !== undefined && event.button !== 0) return;
		const el = triggerRef.current;
		if (el === null || typeof window === 'undefined') return;
		const rect = el.getBoundingClientRect();
		const startX = event.clientX;
		const startY = event.clientY;
		const offsetX = startX - rect.left;
		const offsetY = startY - rect.top;
		let moved = false;

		const onMove = (move: PointerEvent) => {
			if (
				!moved && Math.abs(move.clientX - startX) < DRAG_THRESHOLD_PX &&
					Math.abs(move.clientY - startY) < DRAG_THRESHOLD_PX
			) {
				return;
			}
			// Imperative during the drag: no state, no commits, no storage churn.
			// The snap easing transition would lag a live drag, so disable it.
			if (!moved) el.style.transition = 'none';
			moved = true;
			const next = clampTriggerPosition(move.clientX - offsetX, move.clientY - offsetY, el);
			el.style.left = next.x + 'px';
			el.style.top = next.y + 'px';
			el.style.right = 'auto';
			el.style.bottom = 'auto';
		};
		const onUp = (up: PointerEvent) => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
			if (!moved) return;
			// Restore the easing so the edge snap animates.
			el.style.transition = '';
			// Swallow the click browsers fire right after a drag's pointerup.
			suppressClickRef.current = true;
			setTimeout(() => {
				suppressClickRef.current = false;
			}, 0);
			const snapped = snapTriggerToEdge(up.clientX - offsetX, up.clientY - offsetY, el);
			setTriggerPos(snapped);
			writeTriggerStorage(snapped);
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
	};

	const startDockResize = (event: PointerEvent) => {
		const el = dockRef.current;
		if (el === null || typeof window === 'undefined') return;
		event.preventDefault();
		event.stopPropagation();
		const startY = event.clientY;
		const startHeight = clampDockHeight(getDockPrefs().height ?? dockDefaultHeight());
		let latest = startHeight;
		// The collapse/expand height transition would lag a live drag.
		el.style.transition = 'none';

		const onMove = (move: PointerEvent) => {
			latest = clampDockHeight(startHeight + (startY - move.clientY));
			el.style.height = latest + 'px';
		};
		const onUp = () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
			el.style.transition = '';
			// Persist once, on release — never per pointermove.
			const current = getDockPrefs();
			const next = { ...current, height: latest };
			setDockPrefs(next);
			writeDockStorage(next);
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
	};

	const togglePinned = () => {
		const current = getDockPrefs();
		const next = { ...current, pinned: !current.pinned };
		setDockPrefs(next);
		writeDockStorage(next);
		cancelHide();
		setCollapsed(false);
	};

	const dockPointerEnter = () => {
		cancelHide();
		if (collapsed) setCollapsed(false);
	};

	const dockPointerLeave = () => {
		if (dockPrefs.pinned) return;
		cancelHide();
		hideTimer.current = setTimeout(() => {
			hideTimer.current = null;
			setCollapsed(true);
		}, AUTO_HIDE_DELAY_MS);
	};

	const readPerf = () => {
		const profiler = resolveProfiler(hook);
		if (profiler === null) {
			setPerfRows(null);
			return;
		}
		try {
			setPerfRows(profiler.summary());
		} catch {
			setPerfRows([]);
		}
	};

	const selectTab = (next: string) => {
		setTab(next);
		if (picking && next !== 'components') stopPicking();
		if (next === 'timeline') setEvents(hook.getEvents());
		if (next === 'performance') readPerf();
	};

	// The active plugin tab, when `tab` names one that is still registered.
	const activePlugin = tab.startsWith('plugin:')
		? plugins.find((entry) => 'plugin:' + entry.id === tab) ?? null
		: null;
	const PluginBody =
		activePlugin === null ? null : activePlugin.component;

	const flashCopied = (which: string) => {
		setCopied(which);
		if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
		copiedTimer.current = setTimeout(() => setCopied(null), COPIED_FLASH_MS);
	};

	const copyPrompt = (kind: 'investigate' | 'state') => {
		const selected = getSelectedId();
		const snapshot = buildSnapshot(hook, { includeState: true });
		copyText(
			buildAgentPrompt(snapshot, {
				kind,
				...(selected !== null ? { nodeId: selected } : null),
				issue,
			}),
		);
		flashCopied(kind);
	};

	const copyPerfPrompt = () => {
		copyText(
			buildAgentPrompt(buildSnapshot(hook, { includeState: true }), { kind: 'performance' }),
		);
		flashCopied('performance');
	};

	const copySnapshotJson = () => {
		copyText(JSON.stringify(buildSnapshot(hook, { includeState: true }), null, 2));
		flashCopied('snapshot');
	};

	const exportTrace = () => {
		const profiler = resolveProfiler(hook);
		if (profiler === null) return;
		try {
			const blob = new Blob([JSON.stringify(profiler.exportTrace())], {
				type: 'application/json',
			});
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = 'octane-trace.json';
			anchor.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch {
			// Export is best-effort; a serialization failure must not break the panel.
		}
	};

	const clearPerf = () => {
		const profiler = resolveProfiler(hook);
		if (profiler !== null) {
			try {
				profiler.clear();
			} catch {
			}
		}
		readPerf();
	};

	const togglePerfRecording = (next: boolean) => {
		const profiler = resolveProfiler(hook);
		if (profiler === null) return;
		try {
			if (next) profiler.start();
			else profiler.stop();
			setPerfRecording(next);
		} catch {
		}
	};

	const toggleEventRecording = (next: boolean) => {
		hook.setRecording(next);
		setEventRecording(next);
	};

	const toggleEffectTelemetry = (next: boolean) => {
		hook.setEffectTelemetry(next);
		setEffectTelemetry(next);
	};

	const refreshEvents = () => setEvents(hook.getEvents());

	const clearEvents = () => {
		hook.clearEvents();
		setEvents([]);
	};

	const setEventFilter = (kindName: string, value: boolean) => setEventFilters(
		(current) => ({ ...current, [kindName]: value }),
	);

	const toggleExpanded = (id: number, depth: number) => setExpandedOverrides(
		(current) => ({
			...current,
			[id]: !(current[id] ?? depth < DEFAULT_EXPANDED_DEPTH),
		}),
	);

	const selectNode = (id: number) => {
		setSelectedId(id);
		const nextDetail = hook.inspect(id);
		detailRef.current = nextDetail;
		fingerprintRef.current = computeFingerprint(treeRef.current, nextDetail);
	};

	const hoverNode = (id: number, label: string) => highlightNodes(hook.getDomNodes(id), label);

	const leaveNode = () => clearHighlight();

	const scrollSelectedIntoView = () => {
		const selected = getSelectedId();
		if (selected === null) return;
		for (const domNode of hook.getDomNodes(selected)) {
			const element = domNode as Element;
			if (typeof element.scrollIntoView === 'function') {
				element.scrollIntoView({ block: 'center' });
				return;
			}
		}
	};

	// ── Element picker ────────────────────────────────────────────────────

	const stopPicking = () => {
		pickerHoverRef.current = null;
		setPickerHoverId(null);
		setPicking(false);
		clearHighlight();
	};

	const togglePicker = () => {
		if (picking) stopPicking();
		else setPicking(true);
	};

	/** Expand the ancestor chain so the hovered/selected row is visible. */
	const revealAncestors = (path: DevtoolsTreeNode[] | null) => {
		if (path === null || path.length < 2) return;
		setExpandedOverrides((current) => {
			let changed = false;
			const next = { ...current };
			for (let depth = 0; depth < path.length - 1; depth++) {
				const ancestor = path[depth];
				const effective = current[ancestor.id] ?? depth < DEFAULT_EXPANDED_DEPTH;
				if (!effective) {
					next[ancestor.id] = true;
					changed = true;
				}
			}
			return changed ? next : current;
		});
	};

	const scrollRowIntoView = (id: number) => {
		const rootNode =
			triggerRef.current !== null ? triggerRef.current.getRootNode() : null;
		if (!(rootNode instanceof ShadowRoot)) return;
		const row = rootNode.querySelector('.tree-row[data-node-id="' + id + '"]');
		if (row !== null && typeof (row as HTMLElement).scrollIntoView === 'function') {
			try {
				(row as HTMLElement).scrollIntoView({ block: 'nearest' });
			} catch {
				// Scrolling is best-effort (jsdom, detached rows).
			}
		}
	};

	// Picker listeners exist ONLY while picking and the dock is open; the
	// cleanup removes them the moment either flips or the panel unmounts.
	useEffect(() => {
		if (!picking || !open || typeof window === 'undefined') return;
		const rootNode =
			triggerRef.current !== null ? triggerRef.current.getRootNode() : null;
		const host =
			rootNode instanceof ShadowRoot ? rootNode.host : null;

		let rafPending = false;
		let latestTarget: Node | null = null;
		let processedTarget: Node | null = null;

		const processHover = () => {
			rafPending = false;
			const target = latestTarget;
			if (target === null || target === processedTarget) return;
			processedTarget = target;
			const id = hook.findByDomNode(target);
			if (id === null) {
				if (pickerHoverRef.current !== null) {
					pickerHoverRef.current = null;
					clearHighlight();
					setPickerHoverId(null);
				}
				return;
			}
			if (id === pickerHoverRef.current) return;
			pickerHoverRef.current = id;
			const path = findNodePath(treeRef.current, id);
			highlightNodes(hook.getDomNodes(id), path !== null ? path[path.length - 1].label : '');
			revealAncestors(path);
			setPickerHoverId(id);
		};

		const onPointerMove = (event: Event) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			// Shadow retargeting turns panel-internal events into events on the
			// host itself, so this also covers everything inside the panel.
			if (host !== null && host.contains(target)) return;
			latestTarget = target;
			if (rafPending) return;
			rafPending = true;
			requestAnimationFrame(processHover);
		};

		const onClick = (event: Event) => {
			const target = event.target;
			if (host !== null && target instanceof Node && host.contains(target)) return;
			event.preventDefault();
			event.stopPropagation();
			const id =
				target instanceof Node ? hook.findByDomNode(target) : null;
			if (id !== null) {
				revealAncestors(findNodePath(treeRef.current, id));
				selectNode(id);
				setTimeout(() => scrollRowIntoView(id), 0);
			}
			stopPicking();
		};

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			event.stopPropagation();
			stopPicking();
		};

		window.addEventListener('pointermove', onPointerMove, true);
		window.addEventListener('click', onClick, true);
		window.addEventListener('keydown', onKeyDown, true);
		return () => {
			window.removeEventListener('pointermove', onPointerMove, true);
			window.removeEventListener('click', onClick, true);
			window.removeEventListener('keydown', onKeyDown, true);
			clearHighlight();
		};
	}, [picking, open, hook]);

	// Keep the picker-hovered row scrolled into view after its reveal commits.
	useEffect(() => {
		if (pickerHoverId !== null) scrollRowIntoView(pickerHoverId);
	}, [pickerHoverId]);

	// Derived render data — recomputed only on (throttled) panel renders, and
	// each tab's heavier derivations only while that tab is showing.
	const tree = treeRef.current;
	const detail = detailRef.current;
	const trimmedFilter = filter.trim().toLowerCase();
	const visibleIds =
		trimmedFilter === '' ? null : computeVisibleIds(tree, trimmedFilter);
	const visibleRoots =
		visibleIds === null ? tree : tree.filter((rootNode) => visibleIds.has(rootNode.id));
	const emptyTreeMessage =
		trimmedFilter !== ''
			? 'No components match "' + filter.trim() + '".'
			: 'No live components yet. Interact with the app, or check that the bridge is attached.';
	// Components tab: serialize the selected props once for both the preview
	// and the raw JSON, and pretty-print only while the <details> is open.
	const serializedProps =
		tab === 'components' && detail !== null && detail.props !== undefined
			? serializeValue(detail.props)
			: null;
	const propsPreview =
		serializedProps !== null ? formatValuePreview(serializedProps, 120) : '';
	const propsJson =
		serializedProps !== null && rawPropsOpen ? safeStringify(serializedProps) : '';
	const profiler = resolveProfiler(hook);
	// Performance tab: drop the panel's own components. The compiler-registered
	// source prefix works in any install layout; the substring check is the
	// fallback for bridges without component-source registration.
	const perfRowsFiltered =
		tab !== 'performance' || perfRows === null
			? []
			: perfRows.filter(
					(row) => panelSourcePrefix !== null
						? !row.file.startsWith(panelSourcePrefix)
						: !row.file.includes('octane-devtools'),
				).sort((a, b) => b.totalSelfTime - a.totalSelfTime);
	// Timeline tab: rows carry a precomputed key — the snapshot is replaced
	// wholesale, so a position key is stable enough, and `@for` key expressions
	// cannot read the loop's `index` variable.
	const visibleEvents =
		tab !== 'timeline'
			? []
			: events.filter((entry) => eventFilters[entry.kind] !== false).slice().reverse().map(
					(entry, index) => ({ key: index, entry }),
				);
	const dockHeight = clampDockHeight(dockPrefs.height ?? dockDefaultHeight());
	const isCollapsed = !dockPrefs.pinned && collapsed;
	const dockStyle = { height: (isCollapsed ? DOCK_COLLAPSED_PX : dockHeight) + 'px' };
	const triggerStyle =
		triggerPos === null
			? {}
			: { left: triggerPos.x + 'px', top: triggerPos.y + 'px', right: 'auto', bottom: 'auto' };

	<div>
		<button
			ref={triggerRef}
			class={['trigger', triggerPos === null ? 'pos-' + position : null, { 'is-open': open }]}
			style={triggerStyle}
			title="Toggle Octane DevTools (drag to move)"
			onClick={onTriggerClick}
			onPointerDown={startTriggerDrag}
		>
			<OctaneMark size={16} />
			<span>Octane</span>
		</button>
		@if (open) {
			<section
				ref={dockRef}
				class={['dock', { collapsed: isCollapsed, closing }]}
				style={dockStyle}
				onMouseEnter={dockPointerEnter}
				onMouseLeave={dockPointerLeave}
			>
				<div class="resize-handle" onPointerDown={startDockResize}></div>
				<header class="dock-bar">
					<span class="dock-title">
						<OctaneMark size={14} />
						<span>Octane DevTools</span>
					</span>
					<nav class="tabs">
						@for (const tabEntry of TABS; key tabEntry.id) {
							<button
								class={['tab', { active: tab === tabEntry.id }]}
								onClick={() => selectTab(tabEntry.id)}
							>
								{tabEntry.label as string}
							</button>
						}
						@for (const plugin of plugins; key plugin.id) {
							<button
								class={['tab', 'tab-plugin', { active: tab === 'plugin:' + plugin.id }]}
								onClick={() => selectTab('plugin:' + plugin.id)}
							>
								{plugin.label as string}
							</button>
						}
					</nav>
					<div class="dock-controls">
						<button
							class={['icon-btn', 'pin-btn', { active: dockPrefs.pinned }]}
							title={dockPrefs.pinned
								? 'Unpin — collapse to an edge strip when the pointer leaves'
								: 'Pin the dock open'}
							onClick={togglePinned}
						>
							<PinIcon size={14} />
						</button>
						<button class="icon-btn" title="Close" onClick={toggleOpen}>✕</button>
					</div>
				</header>
				<div class="dock-body">
					@switch (tab) {
						@case 'components': {
							<div class="pane components">
								<div class="tree-pane">
									<div class="tree-toolbar">
										<button
											class={['icon-btn', 'picker-btn', { active: picking }]}
											title="Pick an element on the page: hover previews the owning component, click selects it, Esc cancels"
											onClick={togglePicker}
										>{'⌖'}</button>
										<input
											class="filter"
											type="text"
											placeholder="Filter components…"
											value={filter}
											onInput={(event: Event) => setFilter(
												(event.target as HTMLInputElement).value,
											)}
										/>
									</div>
									<div class="tree-scroll">
										@for (const rootNode of visibleRoots; key rootNode.id) {
											<TreeRow
												node={rootNode}
												depth={0}
												selectedId={selectedId}
												pickerHoverId={pickerHoverId}
												visibleIds={visibleIds}
												overrides={expandedOverrides}
												onToggle={toggleExpanded}
												onSelect={selectNode}
												onHover={hoverNode}
												onLeave={leaveNode}
											/>
										} @empty {
											<div class="empty">
												{emptyTreeMessage as string}
											</div>
										}
									</div>
								</div>
								<div class="inspector">
									@if (detail === null) {
										<div class="empty">
											Select a component to inspect its props, hooks, and DOM.
										</div>
									} @else {
										<div>
											<div class="inspector-head">
												<span class="inspector-title">
													{detail.label as string}
												</span>
												<span class="badge">
													{detail.type as string}
												</span>
											</div>
											@if (detail.source !== null) {
												<div class="row">
													<span class="source" onClick={() => openInEditor(detail.source)}>
														{formatSource(detail.source) as string}
													</span>
													<button class="btn" onClick={() => openInEditor(detail.source)}>
														Open
													</button>
												</div>
											}
											<div class="section">
												<div class="section-title">Props</div>
												@if (detail.props === undefined) {
													<div class="dim">Props are not retained for this node.</div>
												} @else {
													<div>
														<div class="preview">
															{propsPreview as string}
														</div>
														<details
															class="raw"
															onToggle={(event: Event) => setRawPropsOpen(
																(event.target as HTMLDetailsElement).open,
															)}
														>
															<summary>Raw JSON</summary>
															<pre class="pre">
																{propsJson as string}
															</pre>
														</details>
													</div>
												}
											</div>
											<div class="section">
												<div class="section-title">
													{'Hooks (' + detail.hooks.length + ')' as string}
												</div>
												@for (const hookInfo of detail.hooks; key hookInfo.order) {
													<div class="hook-row">
														<span class="hook-order">
															{String(hookInfo.order + 1) as string}
														</span>
														<span class="hook-name">
															{hookInfo.name as string}
														</span>
														@if (hookInfo.source !== null) {
															<span class="source" onClick={() => openInEditor(hookInfo.source)}>
																{shortSource(hookInfo.source) as string}
															</span>
														}
														<span class="hook-value">
															{formatValuePreview(serializeValue(hookInfo.value), 60) as string}
														</span>
														@if (hookInfo.deps !== undefined) {
															<span class="hook-value dim">
																{'deps ' +
																	formatValuePreview(serializeValue(hookInfo.deps), 40) as string}
															</span>
														}
														@if (hookInfo.hasCleanup === true) {
															<span class="badge">cleanup</span>
														}
													</div>
												} @empty {
													<div class="dim">No hooks.</div>
												}
											</div>
											@if (detail.debugValues.length > 0) {
												<div class="section">
													<div class="section-title">
														{'Debug values (' + detail.debugValues.length + ')' as string}
													</div>
													@for (const debug of detail.debugValues; key debug.order) {
														<div class="hook-row">
															@if (debug.owner !== null) {
																<span class="hook-name">
																	{debug.owner as string}
																</span>
															}
															@if (debug.source !== null) {
																<span class="source" onClick={() => openInEditor(debug.source)}>
																	{shortSource(debug.source) as string}
																</span>
															}
															<span class="hook-value">
																{formatValuePreview(serializeValue(debug.value), 80) as string}
															</span>
														</div>
													}
												</div>
											}
											<div class="section">
												<div class="row">
													<span class="dim">
														{'DOM nodes: ' + detail.domNodeCount as string}
													</span>
													<button class="btn" onClick={scrollSelectedIntoView}>
														Scroll into view
													</button>
												</div>
											</div>
											<div class="section">
												<div class="section-title">Agent prompt</div>
												<textarea
													class="issue"
													placeholder="Describe the issue (optional)"
													value={issue}
													onInput={(event: Event) => setIssue(
														(event.target as HTMLTextAreaElement).value,
													)}
												/>
												<div class="row">
													<button class="btn accent" onClick={() => copyPrompt('investigate')}>
														{(copied === 'investigate'
															? 'Copied ✓'
															: 'Copy agent prompt') as string}
													</button>
													<button class="btn" onClick={() => copyPrompt('state')}>
														{(copied === 'state' ? 'Copied ✓' : 'Copy state prompt') as string}
													</button>
												</div>
											</div>
										</div>
									}
								</div>
							</div>
						}
						@case 'performance': {
							<div class="pane column">
								@if (profiler === null) {
									<div class="empty-state">
										The Octane profiler is not installed on this page. Profiling is enabled by a
										profile-instrumented dev build; once the profiler is live, render counts, self
										times, bailouts, and re-render causes appear here.
									</div>
								} @else {
									<div class="pane column">
										<div class="toolbar">
											<button class="btn" onClick={readPerf}>Refresh</button>
											<label class="toggle">
												<input
													type="checkbox"
													checked={perfRecording}
													onChange={(event: Event) => togglePerfRecording(
														(event.target as HTMLInputElement).checked,
													)}
												/>
												<span>Record</span>
											</label>
											<button class="btn" onClick={clearPerf}>Clear</button>
											<button class="btn" onClick={exportTrace}>Export Chrome trace</button>
											<button class="btn accent" onClick={copyPerfPrompt}>
												{(copied === 'performance' ? 'Copied ✓' : 'Copy perf prompt') as string}
											</button>
										</div>
										@if (perfRowsFiltered.length === 0) {
											<div class="empty">
												No recorded renders. Interact with the app, then press Refresh.
											</div>
										} @else {
											<div class="table-wrap">
												<table class="table">
													<thead>
														<tr>
															<th>Component</th>
															<th>File</th>
															<th class="num">Renders</th>
															<th class="num">Bails</th>
															<th class="num">Avg self</th>
															<th class="num">Total self</th>
															<th class="num">Max</th>
															<th class="num">Queue delay</th>
															<th>Dominant cause</th>
														</tr>
													</thead>
													<tbody>
														@for (const perfRow of perfRowsFiltered; key perfRow.componentId) {
															<tr>
																<td>
																	{perfRow.component as string}
																</td>
																<td class="file" title={perfRow.file}>
																	{shortFile(perfRow.file) as string}
																</td>
																<td class="num">
																	{String(perfRow.attempts) as string}
																</td>
																<td class="num">
																	{String(perfRow.bails) as string}
																</td>
																<td class="num">
																	{formatMs(perfRow.averageSelfTime) as string}
																</td>
																<td class="num">
																	{formatMs(perfRow.totalSelfTime) as string}
																</td>
																<td class="num">
																	{formatMs(perfRow.maxInclusiveTime) as string}
																</td>
																<td class="num">
																	{formatMs(perfRow.averageQueueDelay) as string}
																</td>
																<td>
																	{perfRow.dominantCause ?? '—' as string}
																</td>
															</tr>
														}
													</tbody>
												</table>
											</div>
										}
									</div>
								}
							</div>
						}
						@case 'timeline': {
							<div class="pane column">
								<div class="toolbar">
									<button class="btn" onClick={refreshEvents}>Refresh</button>
									<button class="btn" onClick={clearEvents}>Clear</button>
									<label class="toggle">
										<input
											type="checkbox"
											checked={effectTelemetry}
											onChange={(event: Event) => toggleEffectTelemetry(
												(event.target as HTMLInputElement).checked,
											)}
										/>
										<span>Record effect timings (adds per-effect overhead)</span>
									</label>
								</div>
								<div class="toolbar">
									<span class="dim">Show</span>
									@for (const kindName of EVENT_KINDS; key kindName) {
										<label class="toggle">
											<input
												type="checkbox"
												checked={eventFilters[kindName] !== false}
												onChange={(event: Event) => setEventFilter(
													kindName,
													(event.target as HTMLInputElement).checked,
												)}
											/>
											<span>
												{kindName as string}
											</span>
										</label>
									}
								</div>
								<div class="list">
									@for (const item of visibleEvents; key item.key) {
										<div class="event-row">
											<span class={['badge', 'kind-' + item.entry.kind]}>
												{item.entry.kind as string}
											</span>
											<span class="event-text">
												{describeEvent(item.entry) as string}
											</span>
										</div>
									} @empty {
										<div class="empty">
											No events in the snapshot. Press Refresh to read the bridge buffer — the
											timeline never live-appends, because the panel's own commits would flood it.
										</div>
									}
								</div>
							</div>
						}
						@case 'settings': {
							<div class="pane column settings">
								<div class="section">
									<div class="section-title">Bridge</div>
									<div class="row">
										<span class="dim">Status</span>
										<span>
											{(hook.isAttached() ? 'attached' : 'not attached') as string}
										</span>
									</div>
									<div class="row">
										<span class="dim">Bridge protocol</span>
										<span>
											{'v' + hook.version as string}
										</span>
									</div>
									<div class="row">
										<span class="dim">Octane</span>
										<span>
											{'v' + version as string}
										</span>
									</div>
								</div>
								<div class="section">
									<div class="section-title">Recording</div>
									<div class="row">
										<label class="toggle">
											<input
												type="checkbox"
												checked={eventRecording}
												onChange={(event: Event) => toggleEventRecording(
													(event.target as HTMLInputElement).checked,
												)}
											/>
											<span>Record bridge events (commits, roots, HMR)</span>
										</label>
									</div>
									<div class="row">
										<label class="toggle">
											<input
												type="checkbox"
												checked={effectTelemetry}
												onChange={(event: Event) => toggleEffectTelemetry(
													(event.target as HTMLInputElement).checked,
												)}
											/>
											<span>Record effect timings (adds per-effect overhead)</span>
										</label>
									</div>
								</div>
								<div class="section">
									<div class="section-title">Export</div>
									<div class="row">
										<button class="btn accent" onClick={copySnapshotJson}>
											{(copied === 'snapshot' ? 'Copied ✓' : 'Copy full snapshot JSON') as string}
										</button>
									</div>
								</div>
								<p class="hint">
									This panel is its own Octane root inside a shadow-DOM host. Its container is
									marked internal on the bridge before mounting, so the panel never appears in the
									component tree and its components are filtered out of the performance table.
								</p>
							</div>
						}
						@default: {
							<div class="pane column plugin-pane">
								@if (PluginBody !== null) {
									<PluginBody hook={hook} />
								} @else {
									<div class="empty">This tab's plugin is no longer registered.</div>
								}
							</div>
						}
					}
				</div>
			</section>
		}
	</div>
}
