// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/collections/Item.ts).
// octane adaptations: React.Children → octane Children (descriptor arrays); element
// types → `any` descriptors. `<Item>` is a collection DESCRIPTOR component — it renders
// nothing; CollectionBuilder walks it via the static `getCollectionNode` generator.
import type { ItemProps } from '@react-types/shared';
import { Children } from 'octane';
import type { PartialNode } from './types';

function Item<T>(props: ItemProps<T>): any {
	return null;
}

Item.getCollectionNode = function* getCollectionNode<T>(
	props: ItemProps<T>,
	context: any,
): Generator<PartialNode<T>> {
	let { childItems, title, children } = props;

	let rendered = props.title || props.children;
	let textValue =
		props.textValue || (typeof rendered === 'string' ? rendered : '') || props['aria-label'] || '';

	// suppressTextValueWarning is used in components like Tabs, which don't have type to select support.
	if (!textValue && !context?.suppressTextValueWarning && process.env.NODE_ENV !== 'production') {
		console.warn(
			'<Item> with non-plain text contents is unsupported by type to select for accessibility. Please add a `textValue` prop.',
		);
	}

	yield {
		type: 'item',
		props: props,
		rendered,
		textValue,
		'aria-label': props['aria-label'],
		hasChildNodes: hasChildItems(props),
		*childNodes() {
			if (childItems) {
				for (let child of childItems) {
					yield {
						type: 'item',
						value: child,
					};
				}
			} else if (title) {
				let items: PartialNode<T>[] = [];
				Children.forEach(children as any, (child: any) => {
					items.push({
						type: 'item',
						element: child,
					});
				});

				yield* items;
			}
		},
	};
};

function hasChildItems<T>(props: ItemProps<T>) {
	if (props.hasChildItems != null) {
		return props.hasChildItems;
	}

	if (props.childItems) {
		return true;
	}

	if (props.title && Children.count(props.children as any) > 0) {
		return true;
	}

	return false;
}

// We don't want getCollectionNode to show up in the type definition
let _Item = Item as unknown as <T>(props: ItemProps<T>) => any;
export { _Item as Item };
