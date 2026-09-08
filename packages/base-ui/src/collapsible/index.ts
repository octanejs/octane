export * as Collapsible from './index.parts';

export type * from './root/CollapsibleRoot.tsrx';
export type * from './trigger/CollapsibleTrigger.tsrx';
export type * from './panel/CollapsiblePanel.tsrx';

// Retain the named runtime exports of the previous Octane binding.
export {
	Root as CollapsibleRoot,
	Trigger as CollapsibleTrigger,
	Panel as CollapsiblePanel,
} from './index.parts';
