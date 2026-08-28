import {
	OctaneDevtoolsEventClient,
	type NodeDetail,
	type ProfileEventWire,
	type ProfileSnapshot,
	type TransitionSnapshot,
	type WireTreeNode,
} from './client';

interface RuntimeHook {
	version: number;
	getTree(): WireTreeNode[];
	inspect(id: number): NodeDetail | null;
	subscribe(listener: () => void): () => void;
	getTransitionState(): TransitionSnapshot;
}

function getHook(): RuntimeHook | undefined {
	return (globalThis as unknown as { __OCTANE_DEVTOOLS__?: RuntimeHook }).__OCTANE_DEVTOOLS__;
}

// Structural shape of the profile-build global (installed by `octane/profiling`).
// Read via the global rather than imported so devtools stays decoupled from the
// profiling package and testable with a plain fake.
interface ProfilerGlobal {
	summary(): Array<Record<string, unknown>>;
	getEvents(): Array<Record<string, unknown>>;
}

function getProfiler(): ProfilerGlobal | undefined {
	return (globalThis as unknown as { __OCTANE_PROFILER__?: ProfilerGlobal }).__OCTANE_PROFILER__;
}

// The DevTools panel is itself an Octane tree, so the profiler records ITS
// components too. Filter them out of everything we report: it's noise (you're
// profiling your app, not the inspector) and, critically, it stops the panel's
// own re-renders from perpetually changing the profile snapshot — which, with
// the dedupe below, lets the live view settle when the app is idle.
const DEVTOOLS_OWN_COMPONENTS = new Set([
	'OctanePanel',
	'ComponentsTab',
	'ProfilerTab',
	'TransitionsTab',
	'PerfModelTab',
	'TreeRow',
	'NativeReadRows',
	'DevtoolsPortal',
	'TanStackDevtools',
]);

function pruneTree(nodes: WireTreeNode[]): WireTreeNode[] {
	return nodes
		.filter((n) => !DEVTOOLS_OWN_COMPONENTS.has(n.name))
		.map((n) => ({ ...n, children: pruneTree(n.children) }));
}

function toSnapshot(profiler: ProfilerGlobal): ProfileSnapshot {
	const summaries = profiler
		.summary()
		.filter((s) => !DEVTOOLS_OWN_COMPONENTS.has(String(s.component)))
		.map((s) => ({
			componentId: String(s.componentId),
			component: String(s.component),
			file: String(s.file),
			attempts: Number(s.attempts) || 0,
			completed: Number(s.completed) || 0,
			suspended: Number(s.suspended) || 0,
			errored: Number(s.errored) || 0,
			bails: Number(s.bails) || 0,
			totalSelfTime: Number(s.totalSelfTime) || 0,
			maxInclusiveTime: Number(s.maxInclusiveTime) || 0,
			averageSelfTime: Number(s.averageSelfTime) || 0,
			averageQueueDelay: Number(s.averageQueueDelay) || 0,
			dominantCause: (s.dominantCause as string | null) ?? null,
		}));
	const recentEvents = profiler
		.getEvents()
		.filter((e) => !DEVTOOLS_OWN_COMPONENTS.has(String(e.component)))
		.slice(-100)
		.map((e) => ({
			component: String(e.component),
			phase: (e.phase === 'update' ? 'update' : 'mount') as ProfileEventWire['phase'],
			outcome: String(e.outcome) as ProfileEventWire['outcome'],
			selfDuration: Number(e.selfDuration) || 0,
			duration: Number(e.duration) || 0,
			queueDelay: Number(e.queueDelay) || 0,
			causes: Array.isArray(e.causes)
				? (e.causes as Array<{ type?: unknown }>).map((c) => String(c.type ?? '')).filter(Boolean)
				: [],
		}));
	return { summaries, recentEvents };
}

/**
 * Wire the runtime hook to the event bus. Emits a coalesced `tree` snapshot once
 * per scheduler flush; answers `inspect-request` with `inspect` (lazy detail — only
 * the selected node is serialized). Returns a stop function. No-op if the runtime
 * devtools hook is not installed (e.g. a non-profile build).
 */
export function startBridge(
	client: OctaneDevtoolsEventClient = new OctaneDevtoolsEventClient(),
): () => void {
	const hook = getHook();
	if (!hook) return () => {};

	// The panel is itself an Octane tree in the SAME runtime it observes, so an
	// emit → panel re-render → flush → emit cycle would spin the CPU. Two guards
	// tame it into a bounded, mostly-idle live view (as React DevTools does):
	//   1. Throttle: at most one emit per MIN_INTERVAL_MS (leading + trailing).
	//   2. Dedupe: skip an event whose serialized payload is unchanged, so tree
	//      and transition stop emitting entirely once the app goes idle.
	const MIN_INTERVAL_MS = 400;
	let lastEmitAt = 0;
	let trailing: ReturnType<typeof setTimeout> | null = null;
	let lastTree = '';
	let lastProfile = '';
	let lastTransition = '';
	let selectedId: number | null = null;
	let lastInspect = '';

	const emitInspect = (force = false) => {
		if (selectedId === null) return;
		const detail = hook.inspect(selectedId);
		if (detail === null) {
			client.emit('inspect-clear', { id: selectedId });
			selectedId = null;
			lastInspect = '';
			return;
		}
		const serialized = JSON.stringify(detail);
		if (force || serialized !== lastInspect) {
			lastInspect = serialized;
			client.emit('inspect', detail);
		}
	};

	const emitNow = () => {
		if (trailing !== null) {
			clearTimeout(trailing);
			trailing = null;
		}
		lastEmitAt = Date.now();
		const nodes = pruneTree(hook.getTree());
		const treeJson = JSON.stringify(nodes);
		if (treeJson !== lastTree) {
			lastTree = treeJson;
			client.emit('tree', { nodes });
		}
		const profiler = getProfiler();
		if (profiler) {
			const snapshot = toSnapshot(profiler);
			const profileJson = JSON.stringify(snapshot);
			if (profileJson !== lastProfile) {
				lastProfile = profileJson;
				client.emit('profile', snapshot);
			}
		}
		if (typeof hook.getTransitionState === 'function') {
			const transition = hook.getTransitionState();
			const transitionJson = JSON.stringify(transition);
			if (transitionJson !== lastTransition) {
				lastTransition = transitionJson;
				client.emit('transition', transition);
			}
		}
		// Detail remains lazy: refresh only the selected Scope, even when its
		// native revisions change without changing the component tree shape.
		emitInspect();
	};

	const schedule = () => {
		if (trailing !== null) return;
		const since = Date.now() - lastEmitAt;
		if (since >= MIN_INTERVAL_MS) emitNow();
		else trailing = setTimeout(emitNow, MIN_INTERVAL_MS - since);
	};

	const offFlush = hook.subscribe(schedule);

	const offRequest = client.on('inspect-request', (e) => {
		selectedId = e.payload.id;
		emitInspect(true);
	});

	// The panel asks for a fresh snapshot when it mounts; force a full re-emit
	// (reset the dedupe caches) so its tabs populate even if nothing changed
	// since the last emit.
	const offRefresh = client.on('refresh', () => {
		lastTree = '';
		lastProfile = '';
		lastTransition = '';
		lastInspect = '';
		emitNow();
	});

	// Initial snapshot so a panel opened after mount sees current state.
	emitNow();

	return () => {
		offFlush();
		offRequest();
		offRefresh();
		if (trailing !== null) clearTimeout(trailing);
	};
}
