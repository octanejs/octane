import { createElement, isChildrenBlock, useEffect, useMemo, useRef } from 'octane';
import type { Data } from '@dnd-kit/abstract';
import { DragDropManager, Draggable, Feedback } from '@dnd-kit/dom';
import type { DropAnimation } from '@dnd-kit/dom';
import { useComputed } from '../../hooks/useComputed';
import { useDeepSignal } from '../../hooks/useDeepSignal';
import { DragDropContext } from '../context/context';
import { useDragDropManager } from '../hooks/useDragDropManager';

type DragOverlayChild = object | string | number | bigint | boolean | null | undefined;

export interface DragOverlayProps<T extends Data, U extends Draggable<T>> {
	className?: string;
	children: DragOverlayChild | ((source: U) => DragOverlayChild);
	dropAnimation?: DropAnimation | null;
	style?: Record<string, string | number | null | undefined>;
	tag?: string;
	disabled?: boolean | ((source: U | null) => boolean);
}

export function DragOverlay<T extends Data, U extends Draggable<T>>(props: DragOverlayProps<T, U>) {
	const { children, className, dropAnimation, style, tag, disabled } = props;
	const ref = useRef<HTMLElement | null>(null);
	const manager = useDragDropManager<T, U>();
	const source = useComputed(() => manager?.dragOperation.source, [manager]).value ?? null;
	const isDisabled =
		typeof disabled === 'function' ? disabled(source) : disabled;

	useEffect(() => {
		if (!ref.current || !manager || isDisabled) return;
		const feedback = manager.plugins.find((plugin) => plugin instanceof Feedback);
		if (!feedback) return;
		feedback.overlay = ref.current;
		return () => {
			feedback.overlay = undefined;
		};
	}, [manager, isDisabled]);

	useEffect(() => {
		if (!manager) return;
		const feedback = manager.plugins.find((plugin) => plugin instanceof Feedback);
		if (!feedback) return;
		feedback.dropAnimation = dropAnimation;
		return () => {
			feedback.dropAnimation = undefined;
		};
	}, [manager, dropAnimation]);

	const patchedManager = useMemo(() => {
		if (!manager) return null;
		const patchedRegistry = new Proxy(manager.registry, {
			get(target, property) {
				if (property === 'register' || property === 'unregister') return noop;
				return target[property as keyof typeof target];
			},
		});
		return new Proxy(manager, {
			get(target, property) {
				if (property === 'registry') return patchedRegistry;
				return target[property as keyof typeof target];
			},
		});
	}, [manager]);

	let content: unknown = null;
	if (source && !isDisabled) {
		content = typeof children === 'function' && !isChildrenBlock(children)
			? createElement(OverlayChildren, { source, children })
			: children;
	}

	return createElement(DragDropContext.Provider, {
		value: patchedManager as DragDropManager | null,
		children: createElement(
			tag || 'div',
			{ ref, className, style, 'data-dnd-overlay': true },
			content,
		),
	});
}

function noop() {
	return () => {};
}

function OverlayChildren<T extends Data, U extends Draggable<T>>(props: {
	children: (source: U) => DragOverlayChild;
	source: U;
}) {
	return props.children(useDeepSignal(props.source));
}
