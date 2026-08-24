// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { RechartsRootState } from '../store';
import { TooltipPayloadSearcher } from '../tooltipSlice';

export const selectTooltipPayloadSearcher = (state: RechartsRootState): TooltipPayloadSearcher =>
	state.options.tooltipPayloadSearcher;
