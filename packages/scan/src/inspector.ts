// Click-to-inspect: pick a component on the page and see its identity,
// render count, timings, and the profiler's actual schedule causes ("why did
// this render") — data react-scan has to reconstruct from fiber prop
// diffing, but the inspection channel records directly. v1 deliberately
// shows only what the channel already carries; live props/state viewing
// would need new runtime introspection and stays a plan-doc follow-up.
//
// Like the toolbar this is plain shadow-DOM the profiler cannot see. While
// inspect mode is armed, clicks are intercepted (capture phase) — the same
// contract as react-scan's inspector: you are picking, not operating.
import { getReport, __addRenderSink, type OctaneRenderInfo } from './core.js';

/** Last known info per live instance, for element→component hit-testing. */
const instanceInfos = new Map<number, OctaneRenderInfo>();
/** Dev-tool bound: prune oldest entries so week-long sessions stay flat. */
const MAX_TRACKED_INSTANCES = 2000;

let inspecting = false;
let panelHost: HTMLElement | null = null;
let detachSink: (() => void) | null = null;
const changeListeners = new Set<(inspecting: boolean) => void>();

const PANEL_STYLES = `
	:host {
		all: initial;
	}
	.panel {
		position: fixed;
		bottom: 56px;
		right: 16px;
		z-index: 2147483647;
		max-width: 340px;
		padding: 10px 12px;
		border: 1px solid rgba(129, 108, 255, 0.6);
		border-radius: 8px;
		background: rgba(22, 24, 29, 0.97);
		color: #f4eee8;
		font: 11px ui-monospace, Menlo, Consolas, monospace;
		line-height: 1.5;
	}
	.name {
		font-weight: 700;
		font-size: 12px;
	}
	.file {
		color: #99a1b3;
		word-break: break-all;
	}
	.row {
		margin-top: 4px;
	}
	.cause {
		color: #f2c069;
	}
	.hint {
		margin-top: 6px;
		color: #99a1b3;
	}
`;

function sinkBatch(infos: OctaneRenderInfo[]): void {
	for (const info of infos) {
		instanceInfos.delete(info.instanceId);
		instanceInfos.set(info.instanceId, info);
	}
	if (instanceInfos.size > MAX_TRACKED_INSTANCES) {
		const excess = instanceInfos.size - MAX_TRACKED_INSTANCES;
		let index = 0;
		for (const key of instanceInfos.keys()) {
			if (index++ >= excess) break;
			instanceInfos.delete(key);
		}
	}
}

/** DOM depth of `element` — layout-free innermost-match tie-breaker. */
function depthOf(element: Element): number {
	let depth = 0;
	for (let node: Node | null = element; node !== null; node = node.parentNode) depth++;
	return depth;
}

/** The innermost profiled component whose rendered DOM contains `target`. */
function resolveAt(target: Element): OctaneRenderInfo | null {
	let best: OctaneRenderInfo | null = null;
	let bestDepth = -1;
	for (const info of instanceInfos.values()) {
		for (const element of info.domNodes()) {
			if (element !== target && !element.contains(target)) continue;
			const depth = depthOf(element);
			if (depth > bestDepth) {
				bestDepth = depth;
				best = info;
			}
		}
	}
	return best;
}

function hidePanel(): void {
	panelHost?.remove();
	panelHost = null;
}

function showPanel(info: OctaneRenderInfo): void {
	hidePanel();
	panelHost = document.createElement('div');
	panelHost.setAttribute('data-octane-scan-inspector', '');
	const shadow = panelHost.attachShadow({ mode: 'open' });
	const style = document.createElement('style');
	style.textContent = PANEL_STYLES;
	const panel = document.createElement('div');
	panel.className = 'panel';

	const entry = getReport().find((candidate) => candidate.componentId === info.componentId);
	const name = document.createElement('div');
	name.className = 'name';
	name.textContent = info.component;
	const file = document.createElement('div');
	file.className = 'file';
	file.textContent = info.line > 0 ? `${info.file}:${info.line}` : info.file;
	const stats = document.createElement('div');
	stats.className = 'row';
	stats.textContent =
		entry === undefined
			? 'no renders recorded'
			: `${entry.renders} renders · ${entry.bailouts} bailouts · ${entry.totalSelfTime.toFixed(1)}ms self`;
	const causes = document.createElement('div');
	causes.className = 'row cause';
	causes.textContent =
		'last render: ' +
		info.causes
			.map((cause) => (cause.hook !== undefined ? `${cause.type} (${cause.hook})` : cause.type))
			.join(', ');
	const hint = document.createElement('div');
	hint.className = 'hint';
	hint.textContent = 'esc to exit · click another component to inspect it';
	panel.append(name, file, stats, causes, hint);
	shadow.append(style, panel);
	document.documentElement.appendChild(panelHost);
}

function onCaptureClick(event: MouseEvent): void {
	const target = event.target;
	if (!(target instanceof Element)) return;
	// The scan UI itself stays operable in inspect mode.
	if (target.closest('[data-octane-scan-toolbar], [data-octane-scan-inspector]') !== null) return;
	event.preventDefault();
	event.stopPropagation();
	const info = resolveAt(target);
	if (info !== null) showPanel(info);
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key === 'Escape') setInspecting(false);
}

function setInspecting(next: boolean): void {
	if (next === inspecting) return;
	inspecting = next;
	if (next) {
		document.addEventListener('click', onCaptureClick, true);
		document.addEventListener('keydown', onKeydown, true);
	} else {
		document.removeEventListener('click', onCaptureClick, true);
		document.removeEventListener('keydown', onKeydown, true);
		hidePanel();
	}
	for (const listener of changeListeners) {
		try {
			listener(inspecting);
		} catch {
			// UI listeners must never break the app being scanned.
		}
	}
}

export function isInspecting(): boolean {
	return inspecting;
}

/**
 * Start tracking instance→DOM associations (idempotent). Wired at module
 * setup, NOT on the first inspect toggle: components that rendered before
 * the user armed inspect mode must still be resolvable when clicked.
 */
export function installInspector(): void {
	if (detachSink === null) detachSink = __addRenderSink({ batch: sinkBatch });
}

export function toggleInspect(): void {
	installInspector();
	setInspecting(!inspecting);
}

/** Toolbar mirroring: notified whenever inspect mode flips (incl. Escape). */
export function onInspectionChanged(listener: (inspecting: boolean) => void): () => void {
	changeListeners.add(listener);
	return () => {
		changeListeners.delete(listener);
	};
}

/** Test/devtools hygiene: exit inspect mode and drop tracked instances. */
export function teardownInspector(): void {
	setInspecting(false);
	detachSink?.();
	detachSink = null;
	instanceInfos.clear();
}
