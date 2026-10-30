import type { StateContext } from '../state/state.ts';
import { checkAtBottom } from './checkAtBottom.ts';
import { setInitialRenderState } from './setInitialRenderState.ts';

export function setDidLayout(ctx: StateContext) {
	const state = ctx.state;
	state.queuedInitialLayout = true;
	checkAtBottom(ctx);

	setInitialRenderState(ctx, { didLayout: true });
}
