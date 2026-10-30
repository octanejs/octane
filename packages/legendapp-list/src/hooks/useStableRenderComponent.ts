import { type ComponentType, type OctaneNode, type Ref, type RefAttributes, useMemo } from 'octane';

import { useLatestRef } from './useLatestRef.ts';

export function useStableRenderComponent<Props extends object, RenderProps, RefT>(
	renderComponent: ((props: RenderProps) => OctaneNode) | undefined,
	mapProps: (props: Props, ref: Ref<RefT>) => RenderProps,
): ComponentType<Props & RefAttributes<RefT>> {
	const renderComponentRef = useLatestRef(renderComponent);
	const mapPropsRef = useLatestRef(mapProps);

	// A ref is an ordinary prop, so the stable component reads
	// `props.ref` where upstream's forwardRef received it as a second argument.
	return useMemo(
		() => (props: Props & RefAttributes<RefT>) =>
			renderComponentRef.current?.(mapPropsRef.current(props, props.ref as Ref<RefT>)) ?? null,
		[mapPropsRef, renderComponentRef],
	);
}
