import { createElement, type ComponentBody } from 'octane';

import { useReactNodeView } from './useReactNodeView';

type HostComponent = string | ComponentBody<any>;

export interface NodeViewContentProps {
	as?: HostComponent;
	style?: Record<string, unknown>;
	[key: string]: unknown;
}

export function NodeViewContent({ as: Tag = 'div', ...props }: NodeViewContentProps): unknown {
	const { nodeViewContentRef, nodeViewContentChildren } = useReactNodeView();
	// The editable content node is owned by ProseMirror rather than Octane. Keep a
	// fresh adapter so a host-prop update re-attaches that node after Octane has
	// reconciled the wrapper's authored children.
	const contentRef = (element: HTMLElement | null) => nodeViewContentRef?.(element);

	return createElement(Tag, {
		...props,
		ref: contentRef,
		'data-node-view-content': '',
		style: {
			whiteSpace: 'pre-wrap',
			...props.style,
		},
		children: nodeViewContentChildren,
	});
}
