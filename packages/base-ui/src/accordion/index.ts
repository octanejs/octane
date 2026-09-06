export * as Accordion from './index.parts';

export type * from './root/AccordionRoot.tsrx';
export type * from './item/AccordionItem.tsrx';
export type * from './header/AccordionHeader.tsrx';
export type * from './trigger/AccordionTrigger.tsrx';
export type * from './panel/AccordionPanel.tsrx';

// Retain the named runtime exports of the previous Octane binding.
export {
	Root as AccordionRoot,
	Item as AccordionItem,
	Header as AccordionHeader,
	Trigger as AccordionTrigger,
	Panel as AccordionPanel,
} from './index.parts';
