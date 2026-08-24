// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { RechartsRootState } from '../state/store';
import { TooltipSyncState } from '../state/tooltipSlice';

export function selectSynchronisedTooltipState(state: RechartsRootState): TooltipSyncState {
	return state.tooltip.syncInteraction;
}
