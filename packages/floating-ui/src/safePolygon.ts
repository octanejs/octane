// Ported from @floating-ui/react safePolygon — the "safe triangle" close handler
// that keeps a hover floating element open while the cursor traverses toward it.
// Pure geometry; the only framework touchpoints are the shared dom helpers.
import { isElement } from '@floating-ui/utils/dom';

import { clearTimeoutIfSet, contains, getNodeChildren, getTarget } from './utils';

function isPointInPolygon(point: number[], polygon: number[][]): boolean {
	const [x, y] = point;
	let isInsideResult = false;
	const length = polygon.length;
	for (let i = 0, j = length - 1; i < length; j = i++) {
		const [xi, yi] = polygon[i] || [0, 0];
		const [xj, yj] = polygon[j] || [0, 0];
		const intersect = yi >= y !== yj >= y && x <= ((xj - xi) * (y - yi)) / (yj - yi) + xi;
		if (intersect) {
			isInsideResult = !isInsideResult;
		}
	}
	return isInsideResult;
}
function isInside(point: number[], rect: any): boolean {
	return (
		point[0] >= rect.x &&
		point[0] <= rect.x + rect.width &&
		point[1] >= rect.y &&
		point[1] <= rect.y + rect.height
	);
}

export function safePolygon(options: any = {}): any {
	const { buffer = 0.5, blockPointerEvents = false, requireIntent = true } = options;

	const timeoutRef = { current: -1 };
	let hasLanded = false;
	let lastX: number | null = null;
	let lastY: number | null = null;
	let lastCursorTime = typeof performance !== 'undefined' ? performance.now() : 0;

	function getCursorSpeed(x: number, y: number): number | null {
		const currentTime = performance.now();
		const elapsedTime = currentTime - lastCursorTime;
		if (lastX === null || lastY === null || elapsedTime === 0) {
			lastX = x;
			lastY = y;
			lastCursorTime = currentTime;
			return null;
		}
		const deltaX = x - lastX;
		const deltaY = y - lastY;
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
		const speed = distance / elapsedTime;
		lastX = x;
		lastY = y;
		lastCursorTime = currentTime;
		return speed;
	}

	const fn = (_ref: any) => {
		const { x, y, placement, elements, onClose, nodeId, tree } = _ref;
		return function onMouseMove(event: any) {
			function close() {
				clearTimeoutIfSet(timeoutRef);
				onClose();
			}
			clearTimeoutIfSet(timeoutRef);
			if (
				!elements.domReference ||
				!elements.floating ||
				placement == null ||
				x == null ||
				y == null
			) {
				return;
			}
			const { clientX, clientY } = event;
			const clientPoint = [clientX, clientY];
			const target = getTarget(event);
			const isLeave = event.type === 'mouseleave';
			const isOverFloatingEl = contains(elements.floating, target as any);
			const isOverReferenceEl = contains(elements.domReference, target as any);
			const refRect = elements.domReference.getBoundingClientRect();
			const rect = elements.floating.getBoundingClientRect();
			const side = placement.split('-')[0];
			const cursorLeaveFromRight = x > rect.right - rect.width / 2;
			const cursorLeaveFromBottom = y > rect.bottom - rect.height / 2;
			const isOverReferenceRect = isInside(clientPoint, refRect);
			const isFloatingWider = rect.width > refRect.width;
			const isFloatingTaller = rect.height > refRect.height;
			const left = (isFloatingWider ? refRect : rect).left;
			const right = (isFloatingWider ? refRect : rect).right;
			const top = (isFloatingTaller ? refRect : rect).top;
			const bottom = (isFloatingTaller ? refRect : rect).bottom;

			if (isOverFloatingEl) {
				hasLanded = true;
				if (!isLeave) {
					return;
				}
			}
			if (isOverReferenceEl) {
				hasLanded = false;
			}
			if (isOverReferenceEl && !isLeave) {
				hasLanded = true;
				return;
			}
			if (
				isLeave &&
				isElement(event.relatedTarget) &&
				contains(elements.floating, event.relatedTarget)
			) {
				return;
			}
			if (tree && getNodeChildren(tree.nodesRef.current, nodeId).length) {
				return;
			}
			if (
				(side === 'top' && y >= refRect.bottom - 1) ||
				(side === 'bottom' && y <= refRect.top + 1) ||
				(side === 'left' && x >= refRect.right - 1) ||
				(side === 'right' && x <= refRect.left + 1)
			) {
				return close();
			}

			let rectPoly: number[][] = [];
			switch (side) {
				case 'top':
					rectPoly = [
						[left, refRect.top + 1],
						[left, rect.bottom - 1],
						[right, rect.bottom - 1],
						[right, refRect.top + 1],
					];
					break;
				case 'bottom':
					rectPoly = [
						[left, rect.top + 1],
						[left, refRect.bottom - 1],
						[right, refRect.bottom - 1],
						[right, rect.top + 1],
					];
					break;
				case 'left':
					rectPoly = [
						[rect.right - 1, bottom],
						[rect.right - 1, top],
						[refRect.left + 1, top],
						[refRect.left + 1, bottom],
					];
					break;
				case 'right':
					rectPoly = [
						[refRect.right - 1, bottom],
						[refRect.right - 1, top],
						[rect.left + 1, top],
						[rect.left + 1, bottom],
					];
					break;
			}

			function getPolygon([px, py]: number[]): number[][] {
				switch (side) {
					case 'top': {
						const cursorPointOne = [
							isFloatingWider
								? px + buffer / 2
								: cursorLeaveFromRight
									? px + buffer * 4
									: px - buffer * 4,
							py + buffer + 1,
						];
						const cursorPointTwo = [
							isFloatingWider
								? px - buffer / 2
								: cursorLeaveFromRight
									? px + buffer * 4
									: px - buffer * 4,
							py + buffer + 1,
						];
						const commonPoints = [
							[
								rect.left,
								cursorLeaveFromRight
									? rect.bottom - buffer
									: isFloatingWider
										? rect.bottom - buffer
										: rect.top,
							],
							[
								rect.right,
								cursorLeaveFromRight
									? isFloatingWider
										? rect.bottom - buffer
										: rect.top
									: rect.bottom - buffer,
							],
						];
						return [cursorPointOne, cursorPointTwo, ...commonPoints];
					}
					case 'bottom': {
						const cursorPointOne = [
							isFloatingWider
								? px + buffer / 2
								: cursorLeaveFromRight
									? px + buffer * 4
									: px - buffer * 4,
							py - buffer,
						];
						const cursorPointTwo = [
							isFloatingWider
								? px - buffer / 2
								: cursorLeaveFromRight
									? px + buffer * 4
									: px - buffer * 4,
							py - buffer,
						];
						const commonPoints = [
							[
								rect.left,
								cursorLeaveFromRight
									? rect.top + buffer
									: isFloatingWider
										? rect.top + buffer
										: rect.bottom,
							],
							[
								rect.right,
								cursorLeaveFromRight
									? isFloatingWider
										? rect.top + buffer
										: rect.bottom
									: rect.top + buffer,
							],
						];
						return [cursorPointOne, cursorPointTwo, ...commonPoints];
					}
					case 'left': {
						const cursorPointOne = [
							px + buffer + 1,
							isFloatingTaller
								? py + buffer / 2
								: cursorLeaveFromBottom
									? py + buffer * 4
									: py - buffer * 4,
						];
						const cursorPointTwo = [
							px + buffer + 1,
							isFloatingTaller
								? py - buffer / 2
								: cursorLeaveFromBottom
									? py + buffer * 4
									: py - buffer * 4,
						];
						const commonPoints = [
							[
								cursorLeaveFromBottom
									? rect.right - buffer
									: isFloatingTaller
										? rect.right - buffer
										: rect.left,
								rect.top,
							],
							[
								cursorLeaveFromBottom
									? isFloatingTaller
										? rect.right - buffer
										: rect.left
									: rect.right - buffer,
								rect.bottom,
							],
						];
						return [...commonPoints, cursorPointOne, cursorPointTwo];
					}
					case 'right': {
						const cursorPointOne = [
							px - buffer,
							isFloatingTaller
								? py + buffer / 2
								: cursorLeaveFromBottom
									? py + buffer * 4
									: py - buffer * 4,
						];
						const cursorPointTwo = [
							px - buffer,
							isFloatingTaller
								? py - buffer / 2
								: cursorLeaveFromBottom
									? py + buffer * 4
									: py - buffer * 4,
						];
						const commonPoints = [
							[
								cursorLeaveFromBottom
									? rect.left + buffer
									: isFloatingTaller
										? rect.left + buffer
										: rect.right,
								rect.top,
							],
							[
								cursorLeaveFromBottom
									? isFloatingTaller
										? rect.left + buffer
										: rect.right
									: rect.left + buffer,
								rect.bottom,
							],
						];
						return [cursorPointOne, cursorPointTwo, ...commonPoints];
					}
				}
				return [];
			}

			if (isPointInPolygon([clientX, clientY], rectPoly)) {
				return;
			}
			if (hasLanded && !isOverReferenceRect) {
				return close();
			}
			if (!isLeave && requireIntent) {
				const cursorSpeed = getCursorSpeed(event.clientX, event.clientY);
				const cursorSpeedThreshold = 0.1;
				if (cursorSpeed !== null && cursorSpeed < cursorSpeedThreshold) {
					return close();
				}
			}
			if (!isPointInPolygon([clientX, clientY], getPolygon([x, y]))) {
				close();
			} else if (!hasLanded && requireIntent) {
				timeoutRef.current = window.setTimeout(close, 40);
			}
		};
	};
	fn.__options = { blockPointerEvents };
	return fn;
}
