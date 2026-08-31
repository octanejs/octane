import type { ToolkitNestedPortableTextSpan, ToolkitTextNode } from '@portabletext/toolkit';
import {
	LIST_NEST_MODE_HTML,
	buildMarksTree,
	isPortableTextBlock,
	isPortableTextListItemBlock,
	isPortableTextToolkitList,
	isPortableTextToolkitSpan,
	isPortableTextToolkitTextNode,
	nestLists,
	spanToPlainText,
} from '@portabletext/toolkit';
import type {
	PortableTextBlock,
	PortableTextListItemBlock,
	TypedObject,
} from '@portabletext/types';
import { createElement } from 'octane';
import type { OctaneNode } from 'octane';
import { defaultComponents } from './components/defaults';
import { mergeComponents } from './components/merge';
import type {
	MissingComponentHandler,
	NodeRenderer,
	OctanePortableTextList,
	PortableTextOctaneComponents,
	PortableTextProps,
	Serializable,
	SerializedBlock,
} from './types';
import {
	printWarning,
	unknownBlockStyleWarning,
	unknownListItemStyleWarning,
	unknownListStyleWarning,
	unknownMarkWarning,
	unknownTypeWarning,
} from './warnings';

export function PortableText<B extends TypedObject = PortableTextBlock>({
	value: input,
	components: componentOverrides,
	listNestingMode,
	onMissingComponent: missingComponentHandler = printWarning,
}: PortableTextProps<B>): OctaneNode {
	const handleMissingComponent = missingComponentHandler || noop;
	const blocks = Array.isArray(input) ? input : input == null ? [] : [input];
	const nested = nestLists(blocks, listNestingMode || LIST_NEST_MODE_HTML);
	const components = componentOverrides
		? mergeComponents(defaultComponents, componentOverrides)
		: defaultComponents;
	const renderNode = getNodeRenderer(components, handleMissingComponent);
	return nested.map((node, index) => renderNode({ node, index, isInline: false, renderNode }));
}

function getNodeRenderer(
	components: PortableTextOctaneComponents,
	handleMissingComponent: MissingComponentHandler,
): NodeRenderer {
	function renderNode<N extends TypedObject>(options: Serializable<N>): OctaneNode {
		const { node, index, isInline } = options;
		const key = node._key || `node-${index}`;
		if (isPortableTextToolkitList(node)) return renderList(node, index, key);
		if (isPortableTextListItemBlock(node)) return renderListItem(node, index, key);
		if (isPortableTextToolkitSpan(node)) return renderSpan(node, index, key);
		if (node._type in components.types) return renderCustomBlock(node, index, key, isInline);
		if (isPortableTextBlock(node)) return renderBlock(node, index, key, isInline);
		if (isPortableTextToolkitTextNode(node)) return renderText(node, key);
		return renderUnknownType(node, index, key, isInline);
	}

	function renderListItem(node: PortableTextListItemBlock, index: number, key: string) {
		const tree = serializeBlock({ node, index, isInline: false, renderNode });
		const configured = components.listItem;
		const handler = typeof configured === 'function' ? configured : configured[node.listItem];
		const ListItem = handler || components.unknownListItem;
		if (ListItem === components.unknownListItem) {
			const style = node.listItem || 'bullet';
			handleMissingComponent(unknownListItemStyleWarning(style), {
				type: style,
				nodeType: 'listItemStyle',
			});
		}
		let children = tree.children;
		if (node.style && node.style !== 'normal') {
			const { listItem: _listItem, ...blockNode } = node;
			children = renderNode({ node: blockNode, index, isInline: false, renderNode });
		}
		return createElement(ListItem, {
			key,
			value: node,
			index,
			isInline: false,
			renderNode,
			children,
		});
	}

	function renderList(node: OctanePortableTextList, index: number, key: string) {
		const children = node.children.map((child, childIndex) =>
			renderNode({
				node: child._key ? child : { ...child, _key: `li-${index}-${childIndex}` },
				index: childIndex,
				isInline: false,
				renderNode,
			}),
		);
		const configured = components.list;
		const handler = typeof configured === 'function' ? configured : configured[node.listItem];
		const List = handler || components.unknownList;
		if (List === components.unknownList) {
			const style = node.listItem || 'bullet';
			handleMissingComponent(unknownListStyleWarning(style), {
				nodeType: 'listStyle',
				type: style,
			});
		}
		return createElement(List, {
			key,
			value: node,
			index,
			isInline: false,
			renderNode,
			children,
		});
	}

	function renderSpan(node: ToolkitNestedPortableTextSpan, _index: number, key: string) {
		const { markDef, markType, markKey } = node;
		const Span = components.marks[markType] || components.unknownMark;
		const children = node.children.map((child, childIndex) =>
			renderNode({ node: child, index: childIndex, isInline: true, renderNode }),
		);
		if (Span === components.unknownMark) {
			handleMissingComponent(unknownMarkWarning(markType), { nodeType: 'mark', type: markType });
		}
		return createElement(Span, {
			key,
			text: spanToPlainText(node),
			value: markDef,
			markType,
			markKey,
			renderNode,
			children,
		});
	}

	function renderBlock(node: PortableTextBlock, index: number, key: string, isInline: boolean) {
		const { _key, ...serialized } = serializeBlock({ node, index, isInline, renderNode });
		const style = serialized.node.style || 'normal';
		const configured = components.block;
		const handler = typeof configured === 'function' ? configured : configured[style];
		const Block = handler || components.unknownBlockStyle;
		if (Block === components.unknownBlockStyle) {
			handleMissingComponent(unknownBlockStyleWarning(style), {
				nodeType: 'blockStyle',
				type: style,
			});
		}
		return createElement(Block, {
			key,
			...serialized,
			value: serialized.node,
			renderNode,
		});
	}

	function renderText(node: ToolkitTextNode, key: string) {
		if (node.text === '\n') {
			const HardBreak = components.hardBreak;
			return HardBreak ? createElement(HardBreak, { key }) : '\n';
		}
		return node.text;
	}

	function renderUnknownType(node: TypedObject, index: number, key: string, isInline: boolean) {
		const nodeOptions = { value: node, isInline, index, renderNode };
		handleMissingComponent(unknownTypeWarning(node._type), { nodeType: 'block', type: node._type });
		return createElement(components.unknownType, { key, ...nodeOptions });
	}

	function renderCustomBlock(node: TypedObject, index: number, key: string, isInline: boolean) {
		const Component = components.types[node._type];
		return Component
			? createElement(Component, { key, value: node, isInline, index, renderNode })
			: null;
	}

	return renderNode;
}

function serializeBlock(options: Serializable<PortableTextBlock>): SerializedBlock {
	const { node, index, isInline, renderNode } = options;
	const children = buildMarksTree(node).map((child, childIndex) =>
		renderNode({ node: child, isInline: true, index: childIndex, renderNode }),
	);
	return { _key: node._key || `block-${index}`, children, index, isInline, node };
}

function noop() {}
