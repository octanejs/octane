// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { TickItem } from '../../../util/types';
import { TooltipIndex } from '../../tooltipSlice';
import { isNan } from '../../../util/DataUtils';
import { ActiveLabel } from '../../../synchronisation/types';

export const combineActiveLabel = (
	tooltipTicks: ReadonlyArray<TickItem> | undefined,
	activeIndex: TooltipIndex,
): ActiveLabel => {
	const n = Number(activeIndex);
	if (isNan(n) || activeIndex == null) {
		return undefined;
	}
	return n >= 0 ? tooltipTicks?.[n]?.value : undefined;
};
