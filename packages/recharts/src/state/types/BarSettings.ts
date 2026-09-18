// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import type { MinPointSize } from '../../util/BarUtils.tsrx';
import type { MaybeStackedGraphicalItem } from './StackedGraphicalItem';
import type { BaseCartesianGraphicalItemSettings } from '../graphicalItemsSlice';

export type BarSettings = BaseCartesianGraphicalItemSettings &
	MaybeStackedGraphicalItem & {
		type: 'bar';
		maxBarSize: number | undefined;
		minPointSize: MinPointSize;
		/**
		 * When true, zero-dimension bars are not filtered out because the custom shape may still render something visible.
		 */
		hasCustomShape: boolean;
	};
