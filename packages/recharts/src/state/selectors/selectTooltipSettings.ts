// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import type { RechartsRootState } from '../store';
import type { TooltipSettingsState } from '../tooltipSlice';

export const selectTooltipSettings = (state: RechartsRootState): TooltipSettingsState =>
	state.tooltip.settings;
