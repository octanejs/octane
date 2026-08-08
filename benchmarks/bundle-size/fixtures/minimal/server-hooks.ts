import { escapeHtml, hookSlots } from 'octane/server';

export function run() {
	return {
		first: hookSlots(2),
		second: hookSlots(1),
		escaped: escapeHtml('<Octane & SSR>'),
	};
}
