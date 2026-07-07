// Ported from .base-ui/packages/react/src/utils/getDisabledMountTransitionStyles.ts (v1.6.0).
// Returns a `{ style: { transition: 'none' } }` prop entry while a popup is in the `starting`
// transition phase so the initial mount frame doesn't animate; an empty object otherwise.
import { EMPTY_OBJECT } from './empty';
import { DISABLED_TRANSITIONS_STYLE } from './constants';
import type { TransitionStatus } from './useTransitionStatus';

export function getDisabledMountTransitionStyles(transitionStatus: TransitionStatus): {
	style?: Record<string, any> | undefined;
} {
	return transitionStatus === 'starting' ? DISABLED_TRANSITIONS_STYLE : EMPTY_OBJECT;
}
