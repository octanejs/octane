// @octanejs/devtools — in-page developer tools for the octane renderer.
//
// Data layer (serialize/snapshot/prompt) is plain TypeScript over the
// `octane/devtools` bridge; the panel UI is authored in `.tsrx` and rendered
// by Octane itself in an isolated shadow-DOM root.
export {
	formatValuePreview,
	serializeValue,
	type SerializedValue,
	type SerializeOptions,
} from './serialize.js';
export {
	buildSnapshot,
	getDevtoolsHook,
	waitForDevtoolsHook,
	type DevtoolsSnapshot,
	type SnapshotHook,
	type SnapshotNode,
	type SnapshotOptions,
	type SnapshotPerformanceRow,
} from './snapshot.js';
export { buildAgentPrompt, type AgentPromptKind, type AgentPromptOptions } from './prompt.js';
export {
	getPanelSourcePrefix,
	mountDevtoolsPanel,
	type DevtoolsPanelHandle,
	type DevtoolsPanelOptions,
} from './panel/mount.js';
export { mountOctaneDevtools } from './client.js';
export {
	getDevtoolsPanelPlugins,
	registerDevtoolsPanelPlugin,
	subscribeDevtoolsPanelPlugins,
	type DevtoolsPanelPlugin,
	type DevtoolsPanelPluginProps,
} from './panel/plugin-registry.js';
export type {
	DevtoolsDebugValue,
	DevtoolsEvent,
	DevtoolsHookInfo,
	DevtoolsInstanceDetail,
	DevtoolsSourceLocation,
	DevtoolsTreeNode,
	OctaneDevtools,
} from 'octane/devtools';
