// The plugin system — the extension seam. Every consumer above the services
// (the outline overlay, the toolbar, the inspector, and any future flamegraph,
// heatmap, console logger, analytics sink, AI debugger, or timeline exporter)
// is a plugin. A plugin receives read access to the public services and the
// event/commit streams, and returns an optional teardown. It CANNOT reach the
// source, the pipeline internals, or another plugin — the dependency direction
// only ever flows downward, so adding a plugin can never destabilize the engine
// or a sibling.
import type { InspectionEvent, CommitEvent, SourceCapabilities } from './contract.js';
import type { OptionsStore } from './services/options.js';
import type { ComponentRegistry } from './services/registry.js';
import type { ReportStore } from './services/report.js';
import type { InteractionProfiler, InteractionRecord } from './services/interactions.js';
import type { SelectionService, Selection } from './services/selection.js';
import type { FpsMeter } from './services/fps.js';

/** The read-only surface a plugin is handed. Services are public; the pipeline
 *  and source are not — plugins subscribe through the provided hooks only. */
export interface PluginContext {
	/** Which engine adapter is running, and what it can do. */
	readonly engine: string;
	readonly capabilities: SourceCapabilities;
	readonly options: OptionsStore;
	readonly registry: ComponentRegistry;
	readonly report: ReportStore;
	readonly interactions: InteractionProfiler;
	readonly selection: SelectionService;
	readonly fps: FpsMeter;
	/** Every normalized render event, in order. */
	onEvent(listener: (event: InspectionEvent) => void): () => void;
	/** Every committed batch. */
	onCommit(listener: (commit: CommitEvent) => void): () => void;
	/** Every change to the recorded interaction history. */
	onInteraction(listener: (records: InteractionRecord[]) => void): () => void;
	/** Every inspect selection change. */
	onSelection(listener: (selection: Selection) => void): () => void;
	/** Every options change. */
	onOptions(listener: (options: OptionsStore) => void): () => void;
}

export interface Plugin {
	readonly name: string;
	/** Wire the plugin up; return a teardown to unwire it. */
	setup(context: PluginContext): void | (() => void);
}

/** Identity helper for authoring a typed plugin. */
export function definePlugin(plugin: Plugin): Plugin {
	return plugin;
}
