import Yoga, { type Node as YogaNode } from 'yoga-layout';
import type {
	UniversalHostBatch,
	UniversalHostDriver,
	UniversalHostParent,
} from 'octane/universal/native';
import applyStyles, { type Styles } from './styles.js';
import {
	appendChildNode,
	createNode,
	createTextNode,
	emitLayoutListeners,
	insertBeforeNode,
	removeChildNode,
	setAttribute,
	setStyle,
	setTextNodeValue,
	type DOMElement,
	type DOMNode,
	type DOMNodeAttribute,
} from './dom.js';
import type { OutputTransformer } from './render-node-to-output.js';

export interface InkHostContainer {
	readonly root: DOMElement;
	readonly instances: Map<number, DOMNode>;
	readonly parents: Map<number, number | null>;
}

export const createInkContainer = (root: DOMElement): InkHostContainer => ({
	root,
	instances: new Map(),
	parents: new Map(),
});

const cleanupYogaNode = (node?: YogaNode): void => {
	node?.unsetMeasureFunc();
	node?.freeRecursive();
};

const assertParent = (parent: UniversalHostParent): number | null => {
	if (parent !== null && typeof parent !== 'number') {
		throw new Error('@octanejs/ink does not support portal target parents.');
	}

	return parent;
};

const childrenFor = (container: InkHostContainer, parent: number | null): DOMElement => {
	if (parent === null) return container.root;
	const node = container.instances.get(parent);
	if (!node || node.nodeName === '#text') {
		throw new Error(`@octanejs/ink: unknown host parent ${parent}.`);
	}

	return node;
};

const applyProps = (
	node: DOMNode,
	previous: Readonly<Record<string, unknown>>,
	next: Readonly<Record<string, unknown>>,
): void => {
	if (node.nodeName === '#text') {
		setTextNodeValue(node, String(next['value'] ?? ''));
		return;
	}

	const previousStyle = (previous['style'] as Styles | undefined) ?? {};
	const nextStyle = (next['style'] as Styles | undefined) ?? {};
	const changedStyle: Record<string, unknown> = {};
	for (const key of new Set([...Object.keys(previousStyle), ...Object.keys(nextStyle)])) {
		if (previousStyle[key as keyof Styles] !== nextStyle[key as keyof Styles]) {
			changedStyle[key] = nextStyle[key as keyof Styles];
		}
	}
	setStyle(node, nextStyle);
	if (node.yogaNode) applyStyles(node.yogaNode, changedStyle as Styles, nextStyle);

	for (const key of Object.keys(previous)) {
		if (!(key in next) && key !== 'style') setAttribute(node, key, undefined as never);
	}

	for (const [key, value] of Object.entries(next)) {
		if (key === 'style' || key === 'children' || key === 'ref') continue;
		if (key === 'internal_transform') {
			node.internal_transform = value as OutputTransformer | undefined;
			continue;
		}
		if (key === 'internal_static') {
			node.internal_static = value === true;
			continue;
		}
		setAttribute(node, key, value as DOMNodeAttribute);
	}
};

const createHostNode = (type: string, props: Readonly<Record<string, unknown>>): DOMNode => {
	if (type === '#text') return createTextNode(String(props['value'] ?? ''));
	if (
		type !== 'ink-root' &&
		type !== 'ink-box' &&
		type !== 'ink-text' &&
		type !== 'ink-virtual-text'
	) {
		throw new Error(`@octanejs/ink: unsupported host type ${JSON.stringify(type)}.`);
	}
	const node = createNode(type);
	applyProps(node, {}, props);
	return node;
};

const finishCommit = (root: DOMElement): void => {
	root.onComputeLayout?.();
	emitLayoutListeners(root);
	if (root.staticNode !== root.previousStaticNode) {
		root.previousStaticNode = root.staticNode;
		root.onStaticChange?.();
	}
	if (root.isStaticDirty) {
		root.isStaticDirty = false;
		root.onImmediateRender?.();
		return;
	}
	root.onRender?.();
};

export const createInkDriver = (): UniversalHostDriver<InkHostContainer, DOMNode> => ({
	id: 'ink',
	capabilities: { text: 'host', localHostCallbacks: true, visibility: true },
	localCallbacks: {
		classify(name, value) {
			return name === 'internal_transform' && typeof value === 'function'
				? { type: 'transform' }
				: null;
		},
	},
	prepareBatch(container, batch: UniversalHostBatch, context) {
		if (batch.renderer !== 'ink') {
			throw new Error(`@octanejs/ink: renderer mismatch ${JSON.stringify(batch.renderer)}.`);
		}
		const staged = new Map<number, DOMNode>();
		for (const command of batch.commands) {
			if (command.op === 'create')
				staged.set(command.id, createHostNode(command.type, command.props));
		}
		let status: 'prepared' | 'applied' | 'aborted' = 'prepared';
		let callbacksRan = false;
		return {
			apply() {
				if (status !== 'prepared') return;
				status = 'applied';
				for (const command of batch.commands) {
					if (command.op === 'create') {
						container.instances.set(command.id, staged.get(command.id)!);
					} else if (command.op === 'update') {
						const node = container.instances.get(command.id);
						if (!node) throw new Error(`@octanejs/ink: unknown update ${command.id}.`);
						const previous =
							node.nodeName === '#text'
								? { value: node.nodeValue }
								: { ...node.attributes, style: node.style };
						applyProps(node, previous, command.props);
						if (node.nodeName !== '#text' && node.internal_static)
							container.root.isStaticDirty = true;
					} else if (command.op === 'recreate') {
						throw new Error('@octanejs/ink does not request host recreation.');
					} else if (command.op === 'insert' || command.op === 'move') {
						const parentId = assertParent(command.parent);
						const parent = childrenFor(container, parentId);
						const node = container.instances.get(command.id)!;
						if (
							(parent.nodeName === 'ink-text' || parent.nodeName === 'ink-virtual-text') &&
							node.nodeName === 'ink-box'
						) {
							throw new Error('<Box> can’t be nested inside <Text> component');
						}
						if (
							(parent.nodeName === 'ink-text' || parent.nodeName === 'ink-virtual-text') &&
							node.nodeName === 'ink-text'
						) {
							cleanupYogaNode(node.yogaNode);
							(node as DOMElement).nodeName = 'ink-virtual-text';
							(node as { yogaNode?: undefined }).yogaNode = undefined;
						}
						const before =
							command.before === null ? null : container.instances.get(command.before)!;
						if (before) insertBeforeNode(parent, node, before);
						else appendChildNode(parent, node as DOMElement);
						container.parents.set(command.id, parentId);
						if (node.nodeName !== '#text' && node.internal_static) {
							container.root.staticNode = node;
							container.root.isStaticDirty = true;
						}
					} else if (command.op === 'remove') {
						const parent = childrenFor(container, assertParent(command.parent));
						const node = container.instances.get(command.id)!;
						removeChildNode(parent, node);
						container.parents.delete(command.id);
						if (
							node.nodeName !== '#text' &&
							node.internal_static &&
							container.root.staticNode === node
						) {
							container.root.staticNode = undefined;
						}
					} else if (command.op === 'destroy') {
						const node = container.instances.get(command.id);
						cleanupYogaNode(node?.yogaNode);
						container.instances.delete(command.id);
						container.parents.delete(command.id);
					} else if (command.op === 'visibility') {
						const node = container.instances.get(command.id);
						if (node?.yogaNode)
							node.yogaNode.setDisplay(
								command.state === 'visible' ? Yoga.DISPLAY_FLEX : Yoga.DISPLAY_NONE,
							);
					} else if (command.op === 'ensure-public-instance') {
						// Public instances are already materialized eagerly.
					} else if (command.op === 'event' || command.op === 'lifecycle') {
						throw new Error(`@octanejs/ink: unsupported host command ${command.op}.`);
					} else if (command.op === 'local-callback') {
						// Published in afterAccept, once Octane's callback owner table is live.
					} else {
						throw new Error(`@octanejs/ink: unsupported optimized host command ${command.op}.`);
					}
				}
			},
			afterAccept() {
				if (status !== 'applied' || callbacksRan) return;
				callbacksRan = true;
				for (const command of batch.commands) {
					if (command.op !== 'local-callback') continue;
					const node = container.instances.get(command.id);
					if (!node || node.nodeName === '#text' || command.type !== 'transform') continue;
					const listener = command.listener;
					node.internal_transform = listener
						? (children, index) =>
								String(context.invokeLocalCallback(listener.id, [children, index]))
						: undefined;
				}
				finishCommit(container.root);
			},
			abort() {
				if (status !== 'prepared') return;
				status = 'aborted';
				for (const node of staged.values()) cleanupYogaNode(node.yogaNode);
				staged.clear();
			},
		};
	},
	getPublicInstance(container, id) {
		return container.instances.get(id) ?? null;
	},
});
