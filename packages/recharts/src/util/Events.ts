// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import EventEmitter from 'eventemitter3';
import { PayloadAction } from '@reduxjs/toolkit';
import { TooltipSyncState } from '../state/tooltipSlice';
import { BrushStartEndIndex } from '../context/brushUpdateContext';

const eventCenter: EventEmitter<EventTypes> = new EventEmitter();

export { eventCenter };

export const TOOLTIP_SYNC_EVENT = 'recharts.syncEvent.tooltip';

export const BRUSH_SYNC_EVENT = 'recharts.syncEvent.brush';

interface EventTypes {
	[TOOLTIP_SYNC_EVENT](
		syncId: number | string,
		data: PayloadAction<TooltipSyncState>,
		emitter: symbol,
	): void;
	[BRUSH_SYNC_EVENT](syncId: number | string, data: BrushStartEndIndex, emitter: symbol): void;
}
