export const ROW_COUNT = 128;
export const UPDATE_COUNT = 20;
export const ROW_INDICES = Object.freeze(Array.from({ length: ROW_COUNT }, (_, index) => index));

export const CALLBACK_LANES = ['callback-direct', 'callback-nested'];
export const STORE_LANES = ['raw-store', 'zustand-traditional', 'mobx'];
export const LANES = [...CALLBACK_LANES, ...STORE_LANES];

export function isCallbackLane(lane) {
	return CALLBACK_LANES.includes(lane);
}

export function operationsFor(lane) {
	if (!LANES.includes(lane)) throw new Error(`Unknown hook/store lane: ${lane}`);
	return isCallbackLane(lane)
		? ['parent_rerenders', 'changed_dependencies']
		: ['parent_rerenders', 'unchanged_selection', 'changed_selection'];
}
