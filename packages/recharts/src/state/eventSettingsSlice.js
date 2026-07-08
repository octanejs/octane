// Vendored verbatim from recharts@3.9.2 es6/state/eventSettingsSlice.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
import { createSlice } from '@reduxjs/toolkit';
import { castDraft } from 'immer';
export var initialEventSettingsState = {
	throttleDelay: 'raf',
	throttledEvents: ['mousemove', 'touchmove', 'pointermove', 'scroll', 'wheel'],
};
var eventSettingsSlice = createSlice({
	name: 'eventSettings',
	initialState: initialEventSettingsState,
	reducers: {
		setEventSettings: (state, action) => {
			if (action.payload.throttleDelay != null) {
				state.throttleDelay = action.payload.throttleDelay;
			}
			if (action.payload.throttledEvents != null) {
				state.throttledEvents = castDraft(action.payload.throttledEvents);
			}
		},
	},
});
var setEventSettings = eventSettingsSlice.actions.setEventSettings;
export { setEventSettings };
export var eventSettingsReducer = eventSettingsSlice.reducer;
