// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/collections/types.ts).
// octane adaptations: React element types → `any` (octane element descriptors).
import type { Key } from '@react-types/shared';

export interface PartialNode<T> {
	type?: string;
	key?: Key | null;
	value?: T;
	element?: any;
	wrapper?: (element: any) => any;
	rendered?: any;
	textValue?: string;
	'aria-label'?: string;
	index?: number;
	renderer?: (item: T) => any;
	hasChildNodes?: boolean;
	childNodes?: () => IterableIterator<PartialNode<T>>;
	props?: any;
	shouldInvalidate?: (context: any) => boolean;
}
