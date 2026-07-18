// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/collections/CollectionBuilder.ts).
// octane adaptations:
// - React.isValidElement/Fragment/Children → octane's parity helpers over element
//   DESCRIPTORS (value-position JSX). Descriptors carry .type/.props/.key like React
//   elements, so the walk itself is verbatim.
// - OCTANE DIVERGENCE: literal static JSX children are a compiled children BLOCK (a
//   render function), which cannot be statically walked — the hooks-tier builder
//   supports dynamic collections (`items` + render function) and descriptor arrays,
//   and rejects children blocks with a descriptive error. The RAC tier does not have
//   this limitation. Same divergence class as radix `Slot`.
import type { CollectionBase, Key, Node } from '@react-types/shared';
import { Children, Fragment, isChildrenBlock, isValidElement } from 'octane';
import type { PartialNode } from './types';

type CollectionElement<T> = any;

interface CollectionBuilderState {
	renderer?: (value: any) => any;
}

export class CollectionBuilder<T extends object> {
	private context?: unknown;
	private cache: WeakMap<T, Node<T>> = new WeakMap();

	build(props: Partial<CollectionBase<T>>, context?: unknown): Iterable<Node<T>> {
		this.context = context;
		return iterable(() => this.iterateCollection(props as any));
	}

	private *iterateCollection(props: { children?: any; items?: Iterable<T> }): Generator<Node<T>> {
		let { children, items } = props;

		if (isChildrenBlock(children)) {
			throw new Error(
				'Static JSX children are not supported by hooks-tier octane collections: octane ' +
					'compiles children-position JSX into a render block that cannot be statically ' +
					'walked. Pass `items` with a render function returning <Item> descriptors, or an ' +
					'array of <Item> descriptors.',
			);
		}

		if (isValidElement(children) && (children as any).type === Fragment) {
			yield* this.iterateCollection({
				children: (children as any).props.children,
				items,
			});
		} else if (typeof children === 'function') {
			if (!items) {
				throw new Error('props.children was a function but props.items is missing');
			}

			let index = 0;
			for (let item of items) {
				yield* this.getFullNode(
					{
						value: item,
						index,
					},
					{ renderer: children },
				);
				index++;
			}
		} else {
			let items: CollectionElement<T>[] = [];
			Children.forEach(children, (child: any) => {
				if (child) {
					items.push(child);
				}
			});

			let index = 0;
			for (let item of items) {
				let nodes = this.getFullNode(
					{
						element: item,
						index: index,
					},
					{},
				);

				for (let node of nodes) {
					index++;
					yield node;
				}
			}
		}
	}

	private getKey(
		item: NonNullable<CollectionElement<T>>,
		partialNode: PartialNode<T>,
		state: CollectionBuilderState,
		parentKey?: Key | null,
	): Key {
		if (item.key != null) {
			return item.key;
		}

		if (partialNode.type === 'cell' && partialNode.key != null) {
			return `${parentKey}${partialNode.key}`;
		}

		let v = partialNode.value as any;
		if (v != null) {
			let key = v.key ?? v.id;
			if (key == null) {
				throw new Error('No key found for item');
			}

			return key;
		}

		return parentKey ? `${parentKey}.${partialNode.index}` : `$.${partialNode.index}`;
	}

	private getChildState(state: CollectionBuilderState, partialNode: PartialNode<T>) {
		return {
			renderer: partialNode.renderer || state.renderer,
		};
	}

	private *getFullNode(
		partialNode: PartialNode<T> & { index: number },
		state: CollectionBuilderState,
		parentKey?: Key | null,
		parentNode?: Node<T>,
	): Generator<Node<T>> {
		if (isValidElement(partialNode.element) && (partialNode.element as any).type === Fragment) {
			let children: CollectionElement<T>[] = [];

			Children.forEach((partialNode.element as any).props.children, (child: any) => {
				children.push(child);
			});

			let index = partialNode.index ?? 0;

			for (const child of children) {
				yield* this.getFullNode(
					{
						element: child,
						index: index++,
					},
					state,
					parentKey,
					parentNode,
				);
			}

			return;
		}

		// If there's a value instead of an element on the node, and a parent renderer function is available,
		// use it to render an element for the value.
		let element = partialNode.element;
		if (!element && partialNode.value && state && state.renderer) {
			let cached = this.cache.get(partialNode.value);
			if (cached && (!cached.shouldInvalidate || !cached.shouldInvalidate(this.context))) {
				cached.index = partialNode.index;
				cached.parentKey = parentNode ? parentNode.key : null;
				yield cached;
				return;
			}

			element = state.renderer(partialNode.value);
		}

		// If there's an element with a getCollectionNode function on its type, then it's a supported component.
		// Call this function to get a partial node, and recursively build a full node from there.
		if (isValidElement(element)) {
			let type = (element as any).type as any;
			if (typeof type !== 'function' && typeof type?.getCollectionNode !== 'function') {
				let name = (element as any).type;
				throw new Error(`Unknown element <${name}> in collection.`);
			}

			let childNodes = type.getCollectionNode((element as any).props, this.context) as Generator<
				PartialNode<T>,
				void,
				Node<T>[]
			>;
			let index = partialNode.index ?? 0;
			let result = childNodes.next();
			while (!result.done && result.value) {
				let childNode = result.value;

				partialNode.index = index;

				let nodeKey = childNode.key ?? null;
				if (nodeKey == null) {
					nodeKey = childNode.element
						? null
						: this.getKey(
								element as NonNullable<CollectionElement<T>>,
								partialNode,
								state,
								parentKey,
							);
				}

				let nodes = this.getFullNode(
					{
						...childNode,
						key: nodeKey,
						index,
						wrapper: compose(partialNode.wrapper, childNode.wrapper),
					},
					this.getChildState(state, childNode),
					parentKey ? `${parentKey}${(element as any).key}` : (element as any).key,
					parentNode,
				);

				let children = [...nodes];
				for (let node of children) {
					// Cache the node based on its value
					node.value = childNode.value ?? partialNode.value ?? null;
					if (node.value) {
						this.cache.set(node.value, node);
					}

					// The partial node may have specified a type for the child in order to specify a constraint.
					// Verify that the full node that was built recursively matches this type.
					if (partialNode.type && node.type !== partialNode.type) {
						throw new Error(
							`Unsupported type <${capitalize(node.type)}> in <${capitalize(parentNode?.type ?? 'unknown parent type')}>. Only <${capitalize(partialNode.type)}> is supported.`,
						);
					}

					index++;
					yield node;
				}

				result = childNodes.next(children);
			}

			return;
		}

		// Ignore invalid elements
		if (partialNode.key == null || partialNode.type == null) {
			return;
		}

		// Create full node
		let builder = this;
		let node: Node<T> = {
			type: partialNode.type,
			props: partialNode.props,
			key: partialNode.key,
			parentKey: parentNode ? parentNode.key : null,
			value: partialNode.value ?? null,
			level: (parentNode?.level ?? 0) + (parentNode?.type === 'item' ? 1 : 0),
			index: partialNode.index,
			rendered: partialNode.rendered,
			textValue: partialNode.textValue ?? '',
			'aria-label': partialNode['aria-label'],
			wrapper: partialNode.wrapper,
			shouldInvalidate: partialNode.shouldInvalidate,
			hasChildNodes: partialNode.hasChildNodes || false,
			childNodes: iterable(function* () {
				if (!partialNode.hasChildNodes || !partialNode.childNodes) {
					return;
				}

				let index = 0;
				for (let child of partialNode.childNodes()) {
					// Ensure child keys are globally unique by prepending the parent node's key
					if (child.key != null) {
						// TODO: Remove this line entirely and enforce that users always provide unique keys.
						// Currently this line will have issues when a parent has a key `a` and a child with key `bc`
						// but another parent has key `ab` and its child has a key `c`. The combined keys would result in both
						// children having a key of `abc`.
						child.key = `${node.key}${child.key}`;
					}

					let nodes = builder.getFullNode(
						{ ...child, index },
						builder.getChildState(state, child),
						node.key,
						node,
					);
					for (let node of nodes) {
						index++;
						yield node;
					}
				}
			}),
		};

		yield node;
	}
}

// Wraps an iterator function as an iterable object, and caches the results.
function iterable<T>(iterator: () => IterableIterator<Node<T>>): Iterable<Node<T>> {
	let cache: Array<Node<T>> = [];
	let iterable: null | IterableIterator<Node<T>> = null;
	return {
		*[Symbol.iterator]() {
			for (let item of cache) {
				yield item;
			}

			if (!iterable) {
				iterable = iterator();
			}

			for (let item of iterable) {
				cache.push(item);
				yield item;
			}
		},
	};
}

type Wrapper = (element: any) => any;
function compose(outer: Wrapper | void, inner: Wrapper | void): Wrapper | undefined {
	if (outer && inner) {
		return (element) => outer(inner(element));
	}

	if (outer) {
		return outer;
	}

	if (inner) {
		return inner;
	}
}

function capitalize(str: string) {
	return str[0].toUpperCase() + str.slice(1);
}
