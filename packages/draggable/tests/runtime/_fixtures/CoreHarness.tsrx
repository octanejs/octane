import { createElement } from 'octane';
import { DraggableCore, type DraggableCoreProps } from '@octanejs/draggable';

export function CoreHarness(props: DraggableCoreProps & {
	nodeRef: { current: HTMLDivElement | null };
}) {
	const child = createElement(
		'div',
		{ ref: props.nodeRef, id: 'core-target', className: 'kept', style: { color: 'red' } },
		createElement(
			'span',
			{ className: 'handle' },
			createElement('b', { id: 'deep-handle' }, 'handle'),
		),
		createElement(
			'span',
			{ className: 'cancel' },
			createElement('b', { id: 'deep-cancel' }, 'cancel'),
		),
		createElement('span', { id: 'plain' }, 'plain'),
	);
	return DraggableCore({ ...props, children: child });
}
