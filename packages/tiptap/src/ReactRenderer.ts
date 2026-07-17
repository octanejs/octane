import type { Editor } from '@tiptap/core';
import { createElement, flushSync, type ComponentBody, type ElementDescriptor } from 'octane';

import type { EditorWithContentComponent } from './Editor';

export interface ReactRendererOptions {
	/** The editor instance that owns this renderer. */
	editor: Editor;
	/** Initial component props. */
	props?: Record<string, any>;
	/** Wrapper element tag. @default 'div' */
	as?: string;
	/** Additional wrapper classes. */
	className?: string;
}

type RendererProps<R> = Record<string, any> & {
	ref?: ((value: R | null) => void) | { current: R | null } | null;
};

/**
 * Renders an Octane component into a ProseMirror-owned wrapper through the
 * EditorContent portal registry. The React-prefixed name is retained for
 * compatibility with TipTap extensions that only swap their binding import.
 */
export class ReactRenderer<R = unknown, P extends Record<string, any> = object> {
	id: string;
	editor: EditorWithContentComponent;
	component: ComponentBody<P>;
	element: HTMLElement;
	props: P;
	reactElement!: ElementDescriptor<P>;
	ref: R | null = null;
	destroyed = false;

	constructor(
		component: ComponentBody<P>,
		{ editor, props = {}, as = 'div', className = '' }: ReactRendererOptions,
	) {
		this.id = Math.floor(Math.random() * 0xffffffff).toString();
		this.component = component;
		this.editor = editor as EditorWithContentComponent;
		this.props = props as P;
		this.element = document.createElement(as);
		this.element.classList.add('react-renderer');

		if (className) {
			this.element.classList.add(...className.split(' '));
		}

		if (this.editor.isEditorContentInitialized) {
			flushSync(() => this.render());
		} else {
			queueMicrotask(() => {
				if (!this.destroyed) {
					this.render();
				}
			});
		}
	}

	/** Publish the current component descriptor to EditorContent. */
	render(): void {
		if (this.destroyed) {
			return;
		}

		const elementProps = { ...this.props } as P & RendererProps<R>;

		// Octane follows React 19's ordinary-ref-prop model. Components that receive
		// a caller-owned ref keep it; otherwise expose their forwarded value here.
		if (!elementProps.ref) {
			elementProps.ref = (value: R | null) => {
				this.ref = value;
			};
		}

		this.reactElement = createElement(this.component, elementProps as P);
		this.editor.contentComponent?.setRenderer(this.id, this);
	}

	/** Merge changed props and publish a fresh descriptor. */
	updateProps(props: Record<string, any> = {}): void {
		if (this.destroyed) {
			return;
		}

		let changed = false;
		const keys = Object.keys(props);

		for (let index = 0; index < keys.length; index += 1) {
			const key = keys[index];
			if (props[key] !== this.props[key]) {
				changed = true;
				break;
			}
		}

		if (!changed) {
			return;
		}

		this.props = {
			...this.props,
			...props,
		};
		this.render();
	}

	/** Unregister the portal and release any ProseMirror-mounted wrapper. */
	destroy(): void {
		this.destroyed = true;
		this.editor.contentComponent?.removeRenderer(this.id);

		try {
			this.element.parentNode?.removeChild(this.element);
		} catch {
			// ProseMirror may already have detached the wrapper.
		}
	}

	/** Apply attributes to the ProseMirror-facing wrapper element. */
	updateAttributes(attributes: Record<string, string>): void {
		Object.keys(attributes).forEach((key) => {
			this.element.setAttribute(key, attributes[key]);
		});
	}
}
