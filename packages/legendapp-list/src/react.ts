import { descriptorChildren } from 'octane';

import { LegendListRuntime, internal as sharedInternal } from './entrypoints/shared.ts';
import type { LegendListComponent } from './types.web.ts';

// Children mode turns `children` into list items with
// Children.toArray, so call sites must pass inspectable descriptors rather than a
// compiled template body.
export const LegendList = descriptorChildren(LegendListRuntime as LegendListComponent);

/** @internal */
export const internal = sharedInternal;

export {
	useAdaptiveRender,
	useAdaptiveRenderChange,
	useIsLastItem,
	useListScrollSize,
	useRecyclingEffect,
	useRecyclingState,
	useSyncLayout,
	useViewability,
	useViewabilityAmount,
} from './entrypoints/shared.ts';
export * from './types.web.ts';
