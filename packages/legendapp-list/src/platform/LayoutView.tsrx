import { type CSSProperties, type OctaneNode, type RefObject, useRef } from 'octane';

import type { ScrollViewMethods } from '../components/ListComponentScrollView.tsrx';
import { useOnLayoutSync } from '../hooks/useOnLayoutSync.ts';
import type { LayoutRectangle } from './platform-types.ts';
import type { LooseView, StyleProp, ViewStyle } from './scrollview-types.ts';

interface LayoutViewPropsDOM {
	children: OctaneNode;
	onLayoutChange: (rectangle: LayoutRectangle, fromLayoutEffect: boolean) => void;
	refView?: RefObject<ScrollViewMethods | null>;
	style: CSSProperties;
}

interface LayoutViewProps extends Omit<LayoutViewPropsDOM, 'refView' | 'style'> {
	refView?: RefObject<ScrollViewMethods | HTMLElement | LooseView | null>;
	style: StyleProp<ViewStyle> | CSSProperties;
}

export function LayoutView({ onLayoutChange, refView, children, ...rest }: LayoutViewProps) {
	const localRef = useRef<ScrollViewMethods | null>(null);
	const ref = refView ?? localRef;
	useOnLayoutSync({ onLayoutChange, ref });
	return (
		<div {...(rest as LayoutViewPropsDOM)} ref={ref as RefObject<HTMLDivElement>}>
			{children}
		</div>
	);
}
