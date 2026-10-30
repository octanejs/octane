import type { ComponentType, Ref } from 'octane';

import type { LooseScrollViewProps } from '../platform/scrollview-types.ts';
import { useArr$ } from '../state/state.ts';

export interface SnapWrapperProps extends LooseScrollViewProps {
	ScrollComponent: ComponentType<any>;
}

// Refs are props, so the wrapper forwards `ref` without forwardRef.
export function SnapWrapper({
	ScrollComponent,
	ref,
	...props
}: SnapWrapperProps & { ref?: Ref<any> }) {
	const [snapToOffsets] = useArr$(['snapToOffsets']);

	return <ScrollComponent {...props} ref={ref} snapToOffsets={snapToOffsets} />;
}
