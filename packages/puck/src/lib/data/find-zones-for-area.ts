import { PrivateAppState } from '../../types/Internal.tsrx';

export const findZonesForArea = (state: PrivateAppState, area: string) => {
	return Object.keys(state.indexes.zones).filter((zone) => zone.split(':')[0] === area);
};
