import forceHiddenStyles from './forceHiddenStyles.js';
import type { SizingData } from './getSizingData.js';

export type CalculatedNodeHeights = number[];
let hiddenTextarea: HTMLTextAreaElement | null = null;
const getHeight = (node: HTMLElement, data: SizingData) =>
	data.sizingStyle.boxSizing === 'border-box'
		? node.scrollHeight + data.borderSize
		: node.scrollHeight - data.paddingSize;

export default function calculateNodeHeight(
	data: SizingData,
	value: string,
	minRows = 1,
	maxRows = Infinity,
): CalculatedNodeHeights {
	if (!hiddenTextarea) {
		hiddenTextarea = document.createElement('textarea');
		hiddenTextarea.setAttribute('tabindex', '-1');
		hiddenTextarea.setAttribute('aria-hidden', 'true');
		forceHiddenStyles(hiddenTextarea);
	}
	const measurementNode = hiddenTextarea;
	if (measurementNode.parentNode === null) document.body.appendChild(measurementNode);
	Object.assign(measurementNode.style, data.sizingStyle);
	forceHiddenStyles(measurementNode);
	measurementNode.value = value;
	let height = getHeight(measurementNode, data);
	measurementNode.value = value;
	height = getHeight(measurementNode, data);
	measurementNode.value = 'x';
	const rowHeight = measurementNode.scrollHeight - data.paddingSize;
	const boxDelta =
		data.sizingStyle.boxSizing === 'border-box' ? data.paddingSize + data.borderSize : 0;
	height = Math.max(rowHeight * minRows + boxDelta, height);
	height = Math.min(rowHeight * maxRows + boxDelta, height);
	return [height, rowHeight];
}
