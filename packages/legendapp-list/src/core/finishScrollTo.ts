import { addTotalSize } from './addTotalSize.ts';
import { cancelScrollCompletionChecks } from './cancelImperativeScroll.ts';
import { finishInitialScroll } from './finishInitialScroll.ts';
import { recalculateSettledScroll } from './recalculateSettledScroll.ts';
import { PlatformAdjustBreaksScroll } from '../platform/Platform.ts';
import type { StateContext } from '../state/state.ts';

export function finishScrollTo(ctx: StateContext) {
	const state = ctx.state;
	if (state?.scrollingTo) {
		cancelScrollCompletionChecks(state);
		const resolvePendingScroll = state.pendingScrollResolve;
		state.pendingScrollResolve = undefined;

		// Save scrollingTo before clearing it so we can pass it to commitPendingAdjust
		const scrollingTo = state.scrollingTo;

		state.scrollHistory.length = 0;
		state.scrollingTo = undefined;
		state.scrollTargetPinnedRange = undefined;

		if (state.pendingTotalSize !== undefined) {
			addTotalSize(ctx, null, state.pendingTotalSize);
		}

		if (PlatformAdjustBreaksScroll) {
			state.scrollAdjustHandler.commitPendingAdjust(scrollingTo);
		}

		if (scrollingTo.isInitialScroll || state.initialScroll) {
			const isOffsetSession = state.initialScrollSession?.kind === 'offset';
			const shouldPreserveResizeTarget =
				!!scrollingTo.isInitialScroll &&
				!state.clearPreservedInitialScrollOnNextFinish &&
				state.props.data.length > 0 &&
				state.initialScroll?.viewPosition === 1;
			finishInitialScroll(ctx, {
				onFinished: () => {
					resolvePendingScroll?.();
				},
				preserveTarget:
					(isOffsetSession && state.props.data.length === 0) || shouldPreserveResizeTarget,
				recalculateItems: true,
				schedulePreservedTargetClear: shouldPreserveResizeTarget,
				syncObservedOffset: isOffsetSession,
				waitForCompletionFrame: !!scrollingTo.waitForInitialScrollCompletionFrame,
			});
			return;
		}

		recalculateSettledScroll(ctx);
		resolvePendingScroll?.();
	}
}
