import { getScopeContainer } from './runtime-mode.js';

interface VisualViewportInfo {
	width: number;
	height: number;
	offsetLeft: number;
	offsetTop: number;
}

export const getVisualViewport = (): VisualViewportInfo => {
	const scopeContainer = getScopeContainer();
	if (scopeContainer) {
		const rect = scopeContainer.getBoundingClientRect();
		return {
			width: rect.width,
			height: rect.height,
			offsetLeft: rect.left,
			offsetTop: rect.top,
		};
	}

	// Prefer the layout viewport (`clientWidth` / `clientHeight`) so fixed chrome
	// centers against the same box as the page content. `window.innerWidth`
	// includes the classic scrollbar gutter; when a scrollbar appears after mount
	// without a resize event the toolbar would otherwise stay shifted relative to
	// the content column. `visualViewport` still supplies pinch-zoom offsets.
	const layoutWidth = document.documentElement.clientWidth || window.innerWidth;
	const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
	const visualViewport = window.visualViewport;
	if (visualViewport) {
		return {
			width: layoutWidth,
			height: layoutHeight,
			offsetLeft: visualViewport.offsetLeft,
			offsetTop: visualViewport.offsetTop,
		};
	}
	return {
		width: layoutWidth,
		height: layoutHeight,
		offsetLeft: 0,
		offsetTop: 0,
	};
};
