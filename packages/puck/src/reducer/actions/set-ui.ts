import { Data } from '../../types';
import { SetUiAction } from '../actions.tsrx';
import { PrivateAppState } from '../../types/Internal.tsrx';

export const setUiAction = <UserData extends Data>(
	state: PrivateAppState<UserData>,
	action: SetUiAction,
): PrivateAppState<UserData> => {
	if (typeof action.ui === 'object') {
		return {
			...state,
			ui: {
				...state.ui,
				...action.ui,
			},
		};
	}

	return {
		...state,
		ui: {
			...state.ui,
			...action.ui(state.ui),
		},
	};
};
