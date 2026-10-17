import { isRangeClose, isRangeOpen } from '../../src/hydration-protocol.js';

/** List the hydration range comments under `root`, throwing unless they balance. */
export function hydrationMarkerSummary(root: Node) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
	const data: string[] = [];
	let depth = 0;
	let node: Node | null;
	while ((node = walker.nextNode()) !== null) {
		const value = (node as Comment).data;
		if (isRangeOpen(value)) depth++;
		else if (!isRangeClose(value)) continue;
		else if (--depth < 0) throw new Error('Unbalanced hydration marker ' + value);
		data.push(value);
	}
	if (depth !== 0) throw new Error('Unclosed hydration marker');
	return { data, pairs: data.length / 2 };
}
