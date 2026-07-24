import {
	OctaneDevtoolsEventClient,
	type NodeDetail,
	type ProfileEventWire,
	type ProfileSnapshot,
	type WireTreeNode,
} from './client';

interface RuntimeHook {
	version: number;
	getTree(): WireTreeNode[];
	inspect(id: number): NodeDetail | null;
	subscribe(listener: () => void): () => void;
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

function toSnapshot(profiler: ProfilerGlobal): ProfileSnapshot {
	const summaries = profiler.summary().map((s) => ({
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

	// Coalesce: the runtime may fire several times synchronously; emit one tree
	// per microtask tick.
	let scheduled = false;
	const emitSnapshot = () => {
		scheduled = false;
		client.emit('tree', { nodes: hook.getTree() });
		const profiler = getProfiler();
		if (profiler) client.emit('profile', toSnapshot(profiler));
	};
	const offFlush = hook.subscribe(() => {
		if (scheduled) return;
		scheduled = true;
		queueMicrotask(emitSnapshot);
	});

	const offRequest = client.on('inspect-request', (e) => {
		const detail = hook.inspect(e.payload.id);
		if (detail) client.emit('inspect', detail);
	});

	// Emit an initial snapshot so a panel opened after mount sees the tree
	// (and any profiling data already collected).
	emitSnapshot();

	return () => {
		offFlush();
		offRequest();
	};
}
