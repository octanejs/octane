export const ROW_COUNT = 256;
export const GROUP_SIZE = 16;
export const UPDATE_COUNT = 12;
export const CYCLE_COUNT = 8;
export const ROW_INDICES = Object.freeze(Array.from({ length: ROW_COUNT }, (_, index) => index));
export const GROUPS = Object.freeze(
	Array.from({ length: ROW_COUNT / GROUP_SIZE }, (_, id) =>
		Object.freeze({
			id,
			indices: Object.freeze(ROW_INDICES.slice(id * GROUP_SIZE, (id + 1) * GROUP_SIZE)),
		}),
	),
);

export const TARGETS = ['octane-tsrx', 'react'];
export const OPERATIONS = [
	'mount_visible',
	'mount_hidden',
	'hide_reveal',
	'visible_updates',
	'hidden_burst',
	'hidden_descendant_updates',
	'nested_hide_reveal',
	'plain_updates',
	'plain_descendant_updates',
];

export const ASYNC_OPERATIONS = new Set([
	'mount_hidden',
	'hidden_burst',
	'hidden_descendant_updates',
]);

export const WORK_OPERATIONS = [
	'hide_reveal',
	'hidden_burst',
	'hidden_descendant_updates',
	'nested_hide_reveal',
	'plain_updates',
	'plain_descendant_updates',
];

export function assertOperation(operation) {
	if (!OPERATIONS.includes(operation)) throw new Error(`Unknown Activity operation: ${operation}`);
	return operation;
}
