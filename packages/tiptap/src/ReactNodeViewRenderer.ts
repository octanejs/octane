import type {
	DecorationWithType,
	Editor,
	NodeViewProps as CoreNodeViewProps,
	NodeViewRenderer,
	NodeViewRendererOptions,
	NodeViewRendererProps,
} from '@tiptap/core';
import { getRenderedAttributes, isNodeViewSelected, NodeView } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type {
	Decoration,
	DecorationSource,
	NodeView as ProseMirrorNodeView,
} from '@tiptap/pm/view';
import { createElement, memo, type ComponentBody } from 'octane';

import type { EditorWithContentComponent } from './Editor';
import { ReactRenderer } from './ReactRenderer';
import { ReactNodeViewContext, type ReactNodeViewContextProps } from './useReactNodeView';

export type ReactNodeViewRef<T> = {
	current: T | null;
};

export type ReactNodeViewProps<T = HTMLElement> = CoreNodeViewProps & {
	ref: ReactNodeViewRef<T>;
};

export interface ReactNodeViewRendererOptions extends NodeViewRendererOptions {
	/** Decide whether and when a custom update should republish component props. */
	update:
		| ((props: {
				oldNode: ProseMirrorNode;
				oldDecorations: readonly Decoration[];
				oldInnerDecorations: DecorationSource;
				newNode: ProseMirrorNode;
				newDecorations: readonly Decoration[];
				innerDecorations: DecorationSource;
				updateProps: () => void;
		  }) => boolean)
		| null;
	/** Wrapper element tag. */
	as?: string;
	/** Additional wrapper classes. */
	className?: string;
	/** Static wrapper attributes or attributes derived from the current node. */
	attrs?:
		| Record<string, string>
		| ((props: {
				node: ProseMirrorNode;
				HTMLAttributes: Record<string, any>;
		  }) => Record<string, string>);
}

export class ReactNodeView<
	T = HTMLElement,
	Component extends ComponentBody<ReactNodeViewProps<T>> = ComponentBody<ReactNodeViewProps<T>>,
	NodeEditor extends Editor = Editor,
	Options extends ReactNodeViewRendererOptions = ReactNodeViewRendererOptions,
> extends NodeView<Component, NodeEditor, Options> {
	// Core NodeView invokes mount() from its constructor. These fields are therefore
	// assigned before derived class field initializers run and must remain type-only,
	// otherwise native class-field initialization would overwrite the mounted renderer.
	declare renderer: ReactRenderer<unknown, ReactNodeViewProps<T>>;
	declare contentDOMElement: HTMLElement | null;
	selectionRafId: number | null = null;
	declare private currentPos: number | undefined;
	declare private cachedExtensionWithSyncedStorage: NodeViewRendererProps['extension'] | null;

	private handlePositionUpdate = () => {
		const newPos = this.getPos();
		if (typeof newPos !== 'number' || newPos === this.currentPos) {
			return;
		}

		this.currentPos = newPos;
		this.renderer.updateProps({ getPos: () => this.getPos() });

		if (typeof this.options.attrs === 'function') {
			this.updateElementAttributes();
		}
	};

	constructor(component: Component, props: NodeViewRendererProps, options?: Partial<Options>) {
		super(component, props, options);

		if (!this.node.isLeaf) {
			this.contentDOMElement = document.createElement(
				this.options.contentDOMElementTag || (this.node.isInline ? 'span' : 'div'),
			);
			this.contentDOMElement.dataset.nodeViewContentReact = '';
			this.contentDOMElement.dataset.nodeViewWrapper = '';
			this.contentDOMElement.style.whiteSpace = 'inherit';

			// Covers the synchronous portal path. The context ref installed in mount()
			// covers a portal that commits after this constructor returns.
			const contentTarget = this.dom.querySelector('[data-node-view-content]');
			contentTarget?.appendChild(this.contentDOMElement);
		}

		if (this.options.trackNodeViewPosition) {
			this.editor.on('update', this.handlePositionUpdate);
		}
	}

	/** Expose the editor's current mutable extension storage through the original extension. */
	get extensionWithSyncedStorage(): NodeViewRendererProps['extension'] {
		if (!this.cachedExtensionWithSyncedStorage) {
			const editor = this.editor;
			const extension = this.extension;

			this.cachedExtensionWithSyncedStorage = new Proxy(extension, {
				get(target, property, receiver) {
					if (property === 'storage') {
						return editor.storage[extension.name as keyof typeof editor.storage] ?? {};
					}
					return Reflect.get(target, property, receiver);
				},
			});
		}

		return this.cachedExtensionWithSyncedStorage;
	}

	/** Create the context-wrapped component renderer. Called by core NodeView. */
	mount(): void {
		const componentProps = {
			editor: this.editor,
			node: this.node,
			decorations: this.decorations as DecorationWithType[],
			innerDecorations: this.innerDecorations,
			view: this.view,
			selected: false,
			extension: this.extensionWithSyncedStorage,
			HTMLAttributes: this.HTMLAttributes,
			getPos: () => this.getPos(),
			updateAttributes: (attributes: Record<string, any> = {}) => this.updateAttributes(attributes),
			deleteNode: () => this.deleteNode(),
			ref: { current: null } as ReactNodeViewRef<T>,
		} satisfies ReactNodeViewProps<T>;

		if (!(this.component as any).displayName) {
			(this.component as any).displayName =
				this.extension.name.charAt(0).toUpperCase() + this.extension.name.substring(1);
		}

		const context: ReactNodeViewContextProps = {
			onDragStart: this.onDragStart.bind(this),
			nodeViewContentRef: (element) => {
				if (element && this.contentDOMElement && element.firstChild !== this.contentDOMElement) {
					element.removeAttribute('data-node-view-wrapper');
					element.appendChild(this.contentDOMElement);
				}
			},
		};
		const Component = this.component;
		const providerBody: ComponentBody<ReactNodeViewProps<T>> = (props) =>
			createElement(ReactNodeViewContext.Provider, {
				value: context,
				children: createElement(Component, props),
			});
		const ReactNodeViewProvider = memo(providerBody);
		(ReactNodeViewProvider as any).displayName = 'ReactNodeView';

		const as = this.options.as || (this.node.isInline ? 'span' : 'div');
		const { className = '' } = this.options;

		this.handleSelectionUpdate = this.handleSelectionUpdate.bind(this);
		this.renderer = new ReactRenderer(ReactNodeViewProvider, {
			editor: this.editor,
			props: componentProps,
			as,
			className: `node-${this.node.type.name} ${className}`.trim(),
		});

		this.editor.on('selectionUpdate', this.handleSelectionUpdate);
		this.updateElementAttributes();
		this.currentPos = this.getPos();
	}

	get dom(): HTMLElement {
		if (
			this.renderer.element.firstElementChild &&
			!this.renderer.element.firstElementChild.hasAttribute('data-node-view-wrapper')
		) {
			throw new Error('Please use the NodeViewWrapper component for your node view.');
		}

		return this.renderer.element;
	}

	get contentDOM(): HTMLElement | null {
		return this.node.isLeaf ? null : this.contentDOMElement;
	}

	handleSelectionUpdate(): void {
		if (this.selectionRafId) {
			cancelAnimationFrame(this.selectionRafId);
			this.selectionRafId = null;
		}

		this.selectionRafId = requestAnimationFrame(() => {
			this.selectionRafId = null;
			const pos = this.currentPos;
			if (typeof pos !== 'number') {
				return;
			}

			const selected = isNodeViewSelected({
				selection: this.editor.state.selection,
				pos,
				nodeSize: this.node.nodeSize,
				selectedOnTextSelection: this.options.selectedOnTextSelection,
			});

			if (selected) {
				if (!this.renderer.props.selected) {
					this.selectNode();
				}
			} else if (this.renderer.props.selected) {
				this.deselectNode();
			}
		});
	}

	update(
		node: ProseMirrorNode,
		decorations: readonly Decoration[],
		innerDecorations: DecorationSource,
	): boolean {
		const rerenderComponent = (props?: Record<string, any>) => {
			this.renderer.updateProps(props);
			if (typeof this.options.attrs === 'function') {
				this.updateElementAttributes();
			}
		};

		if (node.type !== this.node.type) {
			return false;
		}

		if (typeof this.options.update === 'function') {
			const oldNode = this.node;
			const oldDecorations = this.decorations;
			const oldInnerDecorations = this.innerDecorations;

			this.node = node;
			this.decorations = decorations;
			this.innerDecorations = innerDecorations;
			this.currentPos = this.getPos();

			return this.options.update({
				oldNode,
				oldDecorations,
				newNode: node,
				newDecorations: decorations,
				oldInnerDecorations,
				innerDecorations,
				updateProps: () =>
					rerenderComponent({
						node,
						decorations,
						innerDecorations,
						extension: this.extensionWithSyncedStorage,
					}),
			});
		}

		if (node === this.node) {
			this.node = node;
			this.decorations = decorations;
			this.innerDecorations = innerDecorations;
			return true;
		}

		this.node = node;
		this.decorations = decorations;
		this.innerDecorations = innerDecorations;
		this.currentPos = this.getPos();

		const extraProps: Record<string, any> = {
			node,
			decorations,
			innerDecorations,
			extension: this.extensionWithSyncedStorage,
		};

		if (this.options.trackNodeViewPosition) {
			extraProps.getPos = () => this.getPos();
		}

		rerenderComponent(extraProps);
		return true;
	}

	selectNode(): void {
		this.renderer.updateProps({ selected: true });
		this.renderer.element.classList.add('ProseMirror-selectednode');
	}

	deselectNode(): void {
		this.renderer.updateProps({ selected: false });
		this.renderer.element.classList.remove('ProseMirror-selectednode');
	}

	destroy(): void {
		this.renderer.destroy();
		this.editor.off('selectionUpdate', this.handleSelectionUpdate);

		if (this.options.trackNodeViewPosition) {
			this.editor.off('update', this.handlePositionUpdate);
		}

		this.contentDOMElement = null;
		if (this.selectionRafId) {
			cancelAnimationFrame(this.selectionRafId);
			this.selectionRafId = null;
		}
	}

	updateElementAttributes(): void {
		if (!this.options.attrs) {
			return;
		}

		let attributes: Record<string, string>;
		if (typeof this.options.attrs === 'function') {
			attributes = this.options.attrs({
				node: this.node,
				HTMLAttributes: getRenderedAttributes(this.node, this.editor.extensionManager.attributes),
			});
		} else {
			attributes = this.options.attrs;
		}

		this.renderer.updateAttributes(attributes);
	}
}

/** Create a TipTap node-view renderer backed by an Octane portal. */
export function ReactNodeViewRenderer<T = HTMLElement>(
	component: ComponentBody<ReactNodeViewProps<T>>,
	options?: Partial<ReactNodeViewRendererOptions>,
): NodeViewRenderer {
	return (props) => {
		if (!(props.editor as EditorWithContentComponent).contentComponent) {
			return {} as ProseMirrorNodeView;
		}

		return new ReactNodeView<T>(component, props, options);
	};
}
