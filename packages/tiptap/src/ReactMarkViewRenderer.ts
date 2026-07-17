import type { MarkViewProps, MarkViewRenderer, MarkViewRendererOptions } from '@tiptap/core';
import { MarkView } from '@tiptap/core';
import { createContext, createElement, memo, useContext, type ComponentBody } from 'octane';

import { ReactRenderer } from './ReactRenderer';

export interface MarkViewContextProps {
	markViewContentRef: (element: HTMLElement | null) => void;
}

export const ReactMarkViewContext = createContext<MarkViewContextProps>({
	markViewContentRef: () => {},
});

type HostComponent = string | ComponentBody<any>;

export interface MarkViewContentProps {
	as?: HostComponent;
	[key: string]: unknown;
}

/** Host the ProseMirror-managed content of a custom mark view. */
export function MarkViewContent({ as: Tag = 'span', ...props }: MarkViewContentProps): unknown {
	const { markViewContentRef } = useContext(ReactMarkViewContext);
	// Mark content is mutated by ProseMirror. Re-attach it after any Octane host
	// reconciliation instead of treating the unmanaged child as authored output.
	const contentRef = (element: HTMLElement | null) => markViewContentRef(element);

	return createElement(Tag, {
		...props,
		ref: contentRef,
		'data-mark-view-content': '',
	});
}

export interface ReactMarkViewRendererOptions extends MarkViewRendererOptions {
	/** Wrapper element tag. */
	as?: string;
	/** Additional wrapper classes. */
	className?: string;
	/** Static wrapper attributes. */
	attrs?: Record<string, string>;
}

export class ReactMarkView extends MarkView<
	ComponentBody<MarkViewProps>,
	ReactMarkViewRendererOptions
> {
	renderer: ReactRenderer<unknown, MarkViewProps>;
	contentDOMElement: HTMLElement;

	constructor(
		component: ComponentBody<MarkViewProps>,
		props: MarkViewProps,
		options?: Partial<ReactMarkViewRendererOptions>,
	) {
		super(component, props, options);

		const { as = 'span', attrs, className = '' } = options || {};
		const componentProps = {
			...props,
			updateAttributes: this.updateAttributes.bind(this),
		} satisfies MarkViewProps;

		this.contentDOMElement = document.createElement('span');
		const context: MarkViewContextProps = {
			markViewContentRef: (element) => {
				if (element && !element.contains(this.contentDOMElement)) {
					element.appendChild(this.contentDOMElement);
				}
			},
		};
		const providerBody: ComponentBody<MarkViewProps> = (providerProps) =>
			createElement(ReactMarkViewContext.Provider, {
				value: context,
				children: createElement(component, providerProps),
			});
		const ReactMarkViewProvider = memo(providerBody);
		(ReactMarkViewProvider as any).displayName = 'ReactMarkView';

		this.renderer = new ReactRenderer(ReactMarkViewProvider, {
			editor: props.editor,
			props: componentProps,
			as,
			className: `mark-${props.mark.type.name} ${className}`.trim(),
		});

		if (attrs) {
			this.renderer.updateAttributes(attrs);
		}
	}

	get dom(): HTMLElement {
		return this.renderer.element;
	}

	get contentDOM(): HTMLElement {
		return this.contentDOMElement;
	}

	/** ProseMirror calls this when the mark view leaves the document. */
	destroy(): void {
		this.renderer.destroy();
	}
}

/** Create a TipTap mark-view renderer backed by an Octane portal. */
export function ReactMarkViewRenderer(
	component: ComponentBody<MarkViewProps>,
	options: Partial<ReactMarkViewRendererOptions> = {},
): MarkViewRenderer {
	return (props) => new ReactMarkView(component, props, options);
}
