// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { castDraft } from 'immer';
import { EventThrottlingProps } from '../util/types';

export type EventSettingsState = Required<EventThrottlingProps>;

export const initialEventSettingsState: EventSettingsState = {
	throttleDelay: 'raf',
	throttledEvents: ['mousemove', 'touchmove', 'pointermove', 'scroll', 'wheel'],
};

const eventSettingsSlice = createSlice({
	name: 'eventSettings',
	initialState: initialEventSettingsState,
	reducers: {
		setEventSettings: (state, action: PayloadAction<EventThrottlingProps>) => {
			if (action.payload.throttleDelay != null) {
				state.throttleDelay = action.payload.throttleDelay;
			}
			if (action.payload.throttledEvents != null) {
				state.throttledEvents = castDraft(action.payload.throttledEvents);
			}
		},
	},
});

export const { setEventSettings } = eventSettingsSlice.actions;

export const eventSettingsReducer = eventSettingsSlice.reducer;
