import type { StateContext } from '../state/state.ts';
import { checkThresholds } from '../utils/checkThresholds.ts';

export function recalculateSettledScroll(ctx: StateContext) {
	const state = ctx.state;
	if (state.props?.data) {
		state.triggerCalculateItemsInView?.({ forceFullItemPositions: true });
	}

	checkThresholds(ctx);
}
