import { createElement, type ComponentBody } from 'octane';

import { useReactNodeView } from './useReactNodeView';

type HostComponent = string | ComponentBody<any>;

export interface NodeViewWrapperProps {
	as?: HostComponent;
	ref?: unknown;
	style?: Record<string, unknown>;
	[key: string]: unknown;
}

export function NodeViewWrapper({ as: Tag = 'div', ...props }: NodeViewWrapperProps): unknown {
	const { onDragStart } = useReactNodeView();

	return createElement(Tag, {
		...props,
		ref: props.ref,
		'data-node-view-wrapper': '',
		onDragStart,
		style: {
			whiteSpace: 'normal',
			...props.style,
		},
	});
}
