import { LegendList as LegendListImpl } from '../components/LegendList.tsrx';
import { getStickyPushLimit } from '../components/stickyPositionUtils.ts';
import { POSITION_OUT_OF_VIEW } from '../constants.ts';
import { IsNewArchitecture } from '../constants-platform.ts';
import { useCombinedRef } from '../hooks/useCombinedRef.ts';
import { useLatestRef } from '../hooks/useLatestRef.ts';
import { useStableRenderComponent } from '../hooks/useStableRenderComponent.ts';
import { peek$, useArr$, useStateContext } from '../state/state.ts';
import { typedForwardRef, typedMemo } from '../types.internal.ts';
import { getComponent } from '../utils/getComponent.ts';

export const LegendListRuntime = LegendListImpl;

// Internal bridge exports used by integration entrypoints to avoid duplicating local modules.
/** @internal */
export const internal = {
	getComponent,
	getStickyPushLimit,
	IsNewArchitecture,
	POSITION_OUT_OF_VIEW,
	peek$,
	typedForwardRef,
	typedMemo,
	useArr$,
	useCombinedRef,
	useLatestRef,
	useStableRenderComponent,
	useStateContext,
} as const;

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
} from '../state/ContextContainer.ts';
