// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/collections/Section.ts).
// octane adaptations: React.Children → octane Children (descriptor arrays); element
// types → `any` descriptors. Renders nothing; walked via static `getCollectionNode`.
import type { SectionProps } from '@react-types/shared';
import { Children } from 'octane';
import type { PartialNode } from './types';

function Section<T>(props: SectionProps<T>): any {
	return null;
}

Section.getCollectionNode = function* getCollectionNode<T>(
	props: SectionProps<T>,
): Generator<PartialNode<T>> {
	let { children, title, items } = props;
	yield {
		type: 'section',
		props: props,
		hasChildNodes: true,
		rendered: title,
		'aria-label': props['aria-label'],
		*childNodes() {
			if (typeof children === 'function') {
				if (!items) {
					throw new Error('props.children was a function but props.items is missing');
				}

				for (let item of items) {
					yield {
						type: 'item',
						value: item,
						renderer: children,
					};
				}
			} else {
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

// We don't want getCollectionNode to show up in the type definition
let _Section = Section as unknown as <T>(props: SectionProps<T>) => any;
export { _Section as Section };
