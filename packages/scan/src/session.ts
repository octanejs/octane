// ScanSession — the lifecycle owner and composition root. One responsibility:
// wire a source to a pipeline to the services, gate the live feed on `enabled`,
// build the PluginContext, and manage plugin registration/teardown. This is the
// deliberate replacement for a god `core.ts`: the session composes small
// services but owns none of their behavior. Everything above it depends on the
// PluginContext, never on the source or pipeline directly.
import type { InspectionSource, InspectionEvent, CommitEvent } from './contract.js';
import { createPipeline, type Pipeline } from './pipeline.js';
import { createOptionsStore, type Options, type OptionsStore } from './services/options.js';
import { createRegistry, type ComponentRegistry } from './services/registry.js';
import { createReportStore, type ReportStore } from './services/report.js';
import { createInteractionProfiler, type InteractionProfiler } from './services/interactions.js';
import { createSelectionService, type SelectionService } from './services/selection.js';
import { createFpsMeter, type FpsMeter } from './services/fps.js';
import type { Plugin, PluginContext } from './plugin.js';

export interface ScanSession {
	readonly engine: string;
	readonly options: OptionsStore;
	readonly registry: ComponentRegistry;
	readonly report: ReportStore;
	readonly interactions: InteractionProfiler;
	readonly selection: SelectionService;
	readonly fps: FpsMeter;
	/** Register a plugin; returns a teardown. */
	use(plugin: Plugin): () => void;
	/** Observe every normalized render event (powers onRender). */
	onEvent(listener: (event: InspectionEvent) => void): () => void;
	/** Merge options (drives enablement + notifies plugins). */
	setOptions(patch: Partial<Options>): void;
	getOptions(): Options;
}

export function createSession(source: InspectionSource): ScanSession {
	const pipeline: Pipeline = createPipeline();
	const options = createOptionsStore();
	const registry = createRegistry(pipeline, source);
	const report = createReportStore(pipeline);
	const interactions = createInteractionProfiler(pipeline, registry, options);
	const selection = createSelectionService(registry);
	const fps = createFpsMeter();

	// The source runs from construction so the registry can resolve components
	// that mounted before scanning was enabled (a hydrated page). Enablement
	// gates only the LIVE pipeline feed (report/overlay/interactions), while the
	// registry still backfills from the source buffer.
	source.start();

	let feedDetach: (() => void) | null = null;

	function connectFeed(): void {
		if (feedDetach !== null) return;
		feedDetach = source.subscribe({
			commitStart() {
				try {
					options.get().onCommitStart?.();
				} catch {
					/* consumer isolation */
				}
				pipeline.sink.commitStart?.();
			},
			event(event) {
				pipeline.sink.event(event);
				try {
					options.get().onRender?.(event);
				} catch {
					/* consumer isolation */
				}
			},
			commitFinish() {
				pipeline.sink.commitFinish?.();
				try {
					options.get().onCommitFinish?.();
				} catch {
					/* consumer isolation */
				}
			},
		});
	}

	function disconnectFeed(): void {
		feedDetach?.();
		feedDetach = null;
	}

	function applyEnabled(): void {
		if (options.get().enabled !== false) {
			connectFeed();
			interactions.arm();
		} else {
			disconnectFeed();
			interactions.disarm();
		}
	}

	// Console logging is itself just an event consumer.
	pipeline.onCommit((commit: CommitEvent) => {
		if (options.get().log !== true) return;
		const counts = new Map<string, number>();
		for (const event of commit.events) {
			if (event.type !== 'render') continue;
			counts.set(event.component.name, (counts.get(event.component.name) ?? 0) + 1);
		}
		for (const [name, count] of counts) {
			// eslint-disable-next-line no-console
			console.log(`[octane-scan] ${name} ×${count}`);
		}
	});

	// The live feed is NOT connected at construction: it connects on the first
	// setOptions/scan (matching react-scan's "call scan() to start"). Naming
	// still works before then because the registry backfills from the source
	// buffer, which the eager source.start() has been filling since import.
	const optionsListeners = new Set<(store: OptionsStore) => void>();
	options.subscribe(() => {
		applyEnabled();
		for (const listener of optionsListeners) {
			try {
				listener(options);
			} catch {
				/* consumer isolation */
			}
		}
	});

	const context: PluginContext = {
		engine: source.name,
		capabilities: source.capabilities,
		options,
		registry,
		report,
		interactions,
		selection,
		fps,
		onEvent: (listener: (event: InspectionEvent) => void) => pipeline.onEvent(listener),
		onCommit: (listener: (commit: CommitEvent) => void) => pipeline.onCommit(listener),
		onInteraction: (listener) => {
			const detach = interactions.subscribe(() => listener(interactions.all()));
			return detach;
		},
		onSelection: (listener) => selection.subscribe(listener),
		onOptions: (listener) => {
			optionsListeners.add(listener);
			return () => optionsListeners.delete(listener);
		},
	};

	return {
		engine: source.name,
		options,
		registry,
		report,
		interactions,
		selection,
		fps,
		use(plugin) {
			const teardown = plugin.setup(context);
			return typeof teardown === 'function' ? teardown : () => {};
		},
		onEvent(listener) {
			// onRender needs live events even before scan() connects the feed, so
			// ensure the feed is connected when someone starts observing.
			connectFeed();
			return pipeline.onEvent(listener);
		},
		setOptions(patch) {
			options.set(patch);
		},
		getOptions() {
			return options.get();
		},
	};
}
