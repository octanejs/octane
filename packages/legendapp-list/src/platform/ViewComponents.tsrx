import type { CSSProperties, OctaneNode, Ref } from 'octane';

import type { LooseView, ViewStyle } from './scrollview-types.ts';

interface AnimatedViewPropsDOM {
	style: CSSProperties;
}
interface AnimatedViewProps extends Omit<AnimatedViewPropsDOM, 'style'> {
	style: CSSProperties | ViewStyle;
	ref?: Ref<HTMLDivElement | LooseView>;
}

// Refs are props, so these views take `ref` without forwardRef.
export function AnimatedView({ ref, ...props }: AnimatedViewProps) {
	return <div ref={ref as Ref<HTMLDivElement>} {...(props as AnimatedViewPropsDOM)} />;
}

interface ViewPropsDOM {
	style: CSSProperties;
	onLayout?: (event: {
		nativeEvent: { layout: { x: number; y: number; width: number; height: number } };
	}) => void;
}

interface ViewProps extends Omit<ViewPropsDOM, 'style'> {
	children: OctaneNode;
	style?: CSSProperties | ViewStyle;
	pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
	ref?: Ref<HTMLDivElement>;
}

export function View({ ref, children, ...props }: ViewProps) {
	return (
		<div ref={ref} {...(props as ViewPropsDOM)}>
			{children}
		</div>
	);
}

export const Text = View;
