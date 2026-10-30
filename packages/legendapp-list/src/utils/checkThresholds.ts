import type { StateContext } from '../state/state.ts';
import { checkAtBottom } from './checkAtBottom.ts';
import { checkAtTop } from './checkAtTop.ts';
import type { ReachedEdge } from './edgeReachedGate.ts';

export function checkThresholds(ctx: StateContext, allowedEdge?: ReachedEdge) {
	const allowGateCreatedInCurrentCheck = !ctx.state.edgeReachedGate;
	checkAtBottom(ctx, allowedEdge, allowGateCreatedInCurrentCheck);
	checkAtTop(ctx, allowedEdge, allowGateCreatedInCurrentCheck);
}
