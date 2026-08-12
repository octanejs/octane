// Ported in source order from react-draggable@4.7.1 lib/utils/domFns.ts.
import { findInArray, int, isFunction } from './shims.ts';
import browserPrefix, { browserPrefixToKey } from './getPrefix.ts';
import type { ControlPosition, MouseTouchEvent, PositionOffsetControlPosition } from './types.ts';

type Indexable = Record<string, unknown>;
type EventListenerLike = (event: never) => void | false;
let matchesSelectorFunc = '';
export function matchesSelector(el: Node, selector: string): boolean {
	if (!matchesSelectorFunc)
		matchesSelectorFunc =
			findInArray(
				[
					'matches',
					'webkitMatchesSelector',
					'mozMatchesSelector',
					'msMatchesSelector',
					'oMatchesSelector',
				],
				(method) => isFunction((el as unknown as Indexable)[method]),
			) ?? '';
	const matchFn = (el as unknown as Indexable)[matchesSelectorFunc];
	return isFunction(matchFn) ? Boolean(matchFn.call(el, selector)) : false;
}
export function matchesSelectorAndParentsTo(el: Node, selector: string, baseNode: Node): boolean {
	let node: Node | null = el;
	do {
		if (matchesSelector(node, selector)) return true;
		if (node === baseNode) return false;
		node = node.parentNode;
	} while (node);
	return false;
}
export function addEvent(
	el: Node | null | undefined,
	event: string,
	handler: EventListenerLike,
	inputOptions?: AddEventListenerOptions,
): void {
	if (!el) return;
	const options = { capture: true, ...inputOptions },
		listener = handler as EventListener;
	if (el.addEventListener) el.addEventListener(event, listener, options);
	else if ((el as unknown as Indexable).attachEvent)
		(el as unknown as { attachEvent(name: string, handler: EventListener): void }).attachEvent(
			'on' + event,
			listener,
		);
	else (el as unknown as Indexable)['on' + event] = listener;
}
export function removeEvent(
	el: Node | null | undefined,
	event: string,
	handler: EventListenerLike,
	inputOptions?: AddEventListenerOptions,
): void {
	if (!el) return;
	const options = { capture: true, ...inputOptions },
		listener = handler as EventListener;
	if (el.removeEventListener) el.removeEventListener(event, listener, options);
	else if ((el as unknown as Indexable).detachEvent)
		(el as unknown as { detachEvent(name: string, handler: EventListener): void }).detachEvent(
			'on' + event,
			listener,
		);
	else (el as unknown as Indexable)['on' + event] = null;
}
export function outerHeight(node: HTMLElement): number {
	const s = node.ownerDocument.defaultView!.getComputedStyle(node);
	return node.clientHeight + int(s.borderTopWidth) + int(s.borderBottomWidth);
}
export function outerWidth(node: HTMLElement): number {
	const s = node.ownerDocument.defaultView!.getComputedStyle(node);
	return node.clientWidth + int(s.borderLeftWidth) + int(s.borderRightWidth);
}
export function innerHeight(node: HTMLElement): number {
	const s = node.ownerDocument.defaultView!.getComputedStyle(node);
	return node.clientHeight - int(s.paddingTop) - int(s.paddingBottom);
}
export function innerWidth(node: HTMLElement): number {
	const s = node.ownerDocument.defaultView!.getComputedStyle(node);
	return node.clientWidth - int(s.paddingLeft) - int(s.paddingRight);
}
export function offsetXYFromParent(
	evt: { clientX: number; clientY: number },
	offsetParent: HTMLElement,
	scale: number,
): ControlPosition {
	const rect =
		offsetParent === offsetParent.ownerDocument.body
			? { left: 0, top: 0 }
			: offsetParent.getBoundingClientRect();
	return {
		x: (evt.clientX + offsetParent.scrollLeft - rect.left) / scale,
		y: (evt.clientY + offsetParent.scrollTop - rect.top) / scale,
	};
}
export function createCSSTransform(
	controlPos: ControlPosition,
	positionOffset: PositionOffsetControlPosition,
): Record<string, string> {
	return {
		[browserPrefixToKey('transform', browserPrefix)]: getTranslation(
			controlPos,
			positionOffset,
			'px',
		),
	};
}
export function createSVGTransform(
	controlPos: ControlPosition,
	positionOffset: PositionOffsetControlPosition,
): string {
	return getTranslation(controlPos, positionOffset, '');
}
export function getTranslation(
	{ x, y }: ControlPosition,
	positionOffset: PositionOffsetControlPosition,
	unitSuffix: string,
): string {
	let translation = `translate(${x}${unitSuffix},${y}${unitSuffix})`;
	if (positionOffset)
		translation =
			`translate(${typeof positionOffset.x === 'string' ? positionOffset.x : positionOffset.x + unitSuffix}, ${typeof positionOffset.y === 'string' ? positionOffset.y : positionOffset.y + unitSuffix})` +
			translation;
	return translation;
}
export function getTouch(
	e: MouseTouchEvent,
	identifier: number,
): { clientX: number; clientY: number } | null | undefined {
	return (
		(e.targetTouches && findInArray(e.targetTouches, (t) => identifier === t.identifier)) ||
		(e.changedTouches && findInArray(e.changedTouches, (t) => identifier === t.identifier))
	);
}
export function getTouchIdentifier(e: MouseTouchEvent): number | undefined {
	if (e.targetTouches?.[0]) return e.targetTouches[0].identifier;
	if (e.changedTouches?.[0]) return e.changedTouches[0].identifier;
}
declare const __webpack_nonce__: string | undefined;
function getDefaultNonce(): string | undefined {
	return typeof __webpack_nonce__ !== 'undefined' ? __webpack_nonce__ : undefined;
}
export function addUserSelectStyles(doc: Document | null | undefined, nonce?: string | null): void {
	if (!doc) return;
	let styleEl = doc.getElementById('react-draggable-style-el') as HTMLStyleElement | null;
	if (!styleEl) {
		styleEl = doc.createElement('style');
		styleEl.type = 'text/css';
		styleEl.id = 'react-draggable-style-el';
		const resolvedNonce = nonce ?? getDefaultNonce();
		if (resolvedNonce) styleEl.setAttribute('nonce', resolvedNonce);
		styleEl.innerHTML =
			'.react-draggable-transparent-selection *::-moz-selection {all: inherit;}\n.react-draggable-transparent-selection *::selection {all: inherit;}\n';
		doc.getElementsByTagName('head')[0].appendChild(styleEl);
	}
	if (doc.body) addClassName(doc.body, 'react-draggable-transparent-selection');
}
export function scheduleRemoveUserSelectStyles(doc: Document | null | undefined): void {
	if (window.requestAnimationFrame) window.requestAnimationFrame(() => removeUserSelectStyles(doc));
	else removeUserSelectStyles(doc);
}
function removeUserSelectStyles(doc: Document | null | undefined): void {
	if (!doc) return;
	try {
		if (doc.body) removeClassName(doc.body, 'react-draggable-transparent-selection');
		const selection = (doc as unknown as { selection?: { empty(): void } }).selection;
		if (selection) selection.empty();
		else {
			const current = (doc.defaultView || window).getSelection();
			if (current && current.type !== 'Caret') current.removeAllRanges();
		}
	} catch {}
}
export function addClassName(el: HTMLElement, className: string): void {
	if (el.classList) el.classList.add(className);
	else if (!el.className.match(new RegExp(`(?:^|\\s)${className}(?!\\S)`)))
		el.className += ` ${className}`;
}
export function removeClassName(el: HTMLElement, className: string): void {
	if (el.classList) el.classList.remove(className);
	else el.className = el.className.replace(new RegExp(`(?:^|\\s)${className}(?!\\S)`, 'g'), '');
}
