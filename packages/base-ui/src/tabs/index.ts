export * as Tabs from './index.parts';

export type * from './root/TabsRoot.tsrx';
export type * from './indicator/TabsIndicator.tsrx';
export type * from './tab/TabsTab.tsrx';
export type * from './panel/TabsPanel.tsrx';
export type * from './list/TabsList.tsrx';

// Retain the named runtime exports of the previous Octane binding.
export {
	Root as TabsRoot,
	List as TabsList,
	Tab as TabsTab,
	Panel as TabsPanel,
} from './index.parts';

export type {
	TabsTabValue as TabsValue,
	TabsTabActivationDirection as TabsActivationDirection,
} from './tab/TabsTab.tsrx';
export type { TabsRootOrientation as TabsOrientation } from './root/TabsRoot.tsrx';
