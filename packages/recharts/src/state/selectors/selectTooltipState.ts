// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { RechartsRootState } from '../store';
import { TooltipState } from '../tooltipSlice';

export const selectTooltipState = (state: RechartsRootState): TooltipState => state.tooltip;
