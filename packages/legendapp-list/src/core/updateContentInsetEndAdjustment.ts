import { retargetActiveInitialScrollAtEnd } from './initialScrollLifecycle.ts';
import { updateScroll } from './updateScroll.ts';
import { Platform } from '../platform/Platform.ts';
import { getContentInsetEnd } from '../state/getContentInsetEnd.ts';
import { peek$, type StateContext } from '../state/state.ts';
import { requestAdjust } from '../utils/requestAdjust.ts';

export function updateContentInsetEndAdjustment(
	ctx: StateContext,
	previousContentInsetEndAdjustment?: number,
) {
	const state = ctx.state;
	const previousContentInsetEnd = getContentInsetEnd(ctx, previousContentInsetEndAdjustment);
	const nextContentInsetEnd = getContentInsetEnd(ctx);
	const insetDiff = nextContentInsetEnd - previousContentInsetEnd;

	if (insetDiff !== 0) {
		const wasWithinEndThreshold = !!peek$(ctx, 'isWithinMaintainScrollAtEndThreshold');

		updateScroll(ctx, state.scroll, true, { markHasScrolled: false });

		const didRetargetInitialScroll = retargetActiveInitialScrollAtEnd(ctx);
		if (
			!didRetargetInitialScroll &&
			wasWithinEndThreshold &&
			(Platform.OS !== 'web' || insetDiff > 0)
		) {
			requestAdjust(ctx, insetDiff);
		}
	}
}
