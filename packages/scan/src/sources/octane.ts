// The Octane engine adapter: the ONLY module in the subsystem that imports
// octane internals. It normalizes octane's profile-build inspection channel
// (`octane/profiling`) into the framework-agnostic InspectionEvent contract.
// Swap this for a ReactInspectionSource (over fibers) or any other adapter and
// nothing above it changes.
//
// The profiler is started eagerly at construction so instances register from
// the very first render — including a hydrated page's initial mount, which
// happens before scanning is toggled on. Everything Octane-specific
// (ProfileEvent shape, domNodes resolver, the event ring buffer) is contained
// here and never named again upstream.
import { profiler, __profileComponentId } from 'octane/profiling';
import type { ProfileEvent, ProfileSubscriber } from 'octane/profiling';
import type {
	InspectionEvent,
	InspectionSink,
	InspectionSource,
	RenderOutcome,
	SourceCapabilities,
} from '../contract.js';

let nextEventId = 1;

function toEvent(profile: ProfileEvent): InspectionEvent {
	const instanceId = profile.instanceId;
	return {
		id: nextEventId++,
		type: profile.type === 'component-bailout' ? 'bailout' : 'render',
		component: {
			id: profile.componentId,
			name: profile.component,
			file: profile.file,
			line: profile.line,
			column: profile.column,
		},
		instanceId,
		phase: profile.phase,
		outcome: (profile.type === 'component-bailout' ? 'bailed' : profile.outcome) as RenderOutcome,
		startTime: profile.startTime,
		duration: profile.duration,
		selfDuration: profile.selfDuration,
		causes: profile.causes.map((cause) => ({
			type: cause.type,
			hook: cause.hook,
			source: cause.source,
		})),
		domNodes: () => profiler.domNodes(instanceId),
	};
}

const CAPABILITIES: SourceCapabilities = {
	causes: true,
	timings: true,
	domRanges: true,
	// Octane can walk the scope tree, but the profiler does not yet expose a
	// public owner lookup; the inspector degrades to no breadcrumb until it does.
	hierarchy: false,
	propsInspection: false,
};

export class OctaneInspectionSource implements InspectionSource {
	readonly name = 'octane';
	readonly capabilities = CAPABILITIES;

	start(): void {
		// Idempotent: begins buffering + instance registration. In an unprofiled
		// build this is a stripped no-op.
		profiler.start();
	}

	stop(): void {
		// Intentionally left running: keeping the buffer warm lets the registry
		// resolve components that never re-render while scanning is paused.
	}

	subscribe(sink: InspectionSink): () => void {
		const subscriber: ProfileSubscriber = {
			event: (profile) => sink.event(toEvent(profile)),
			commitStart: () => sink.commitStart?.(),
			commitFinish: () => sink.commitFinish?.(),
		};
		return profiler.subscribe(subscriber);
	}

	domNodes(instanceId: number): Element[] {
		return profiler.domNodes(instanceId);
	}

	*bufferedEvents(): Iterable<InspectionEvent> {
		for (const profile of profiler.getEvents()) yield toEvent(profile);
	}
}

/** Resolve a component function to its compile-time identity id (for onRender). */
export function componentId(component: Function): string {
	return __profileComponentId(component);
}
