import { memo, useCallback, useLayoutEffect, useRef, useState } from 'octane';
import type { ComponentType, RefObject } from 'react';

const emptyRect = {
	top: 0,
	right: 0,
	bottom: 0,
	left: 0,
	width: 0,
	height: 0,
};

type rectShape = {
	top: number;
	right: number;
	bottom: number;
	left: number;
	width: number;
	height: number;
};

export type WithBoundingRectsProps = {
	getRects?: () => { rect: rectShape; parentRect: rectShape };
	rect?: rectShape;
	parentRect?: rectShape;
	nodeRef?: RefObject<HTMLElement>;
};

export default function withBoundingRects<Props extends object = {}>(
	BaseComponent: ComponentType<Props>,
): ComponentType<Props> {
	function WrappedComponent(props: Props) {
		const nodeRef = useRef<HTMLElement | null>(null);
		const [rects, setRects, getRectsState] = useState<{
			rect?: rectShape;
			parentRect?: rectShape;
		}>({ rect: undefined, parentRect: undefined });

		const getRects = useCallback(() => {
			const node = nodeRef.current;
			if (!node) return getRectsState() as { rect: rectShape; parentRect: rectShape };
			const parentNode = node.parentNode as HTMLElement | null;
			const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : emptyRect;
			const parentRect = parentNode?.getBoundingClientRect
				? parentNode.getBoundingClientRect()
				: emptyRect;
			return { rect, parentRect };
		}, [getRectsState]);

		useLayoutEffect(() => {
			setRects(getRects());
		}, [getRects]);

		return <BaseComponent nodeRef={nodeRef} getRects={getRects} {...rects} {...props} />;
	}

	WrappedComponent.displayName = `withBoundingRects(${BaseComponent.displayName || ''})`;
	return memo(WrappedComponent) as unknown as ComponentType<Props>;
}
