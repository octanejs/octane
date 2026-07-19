// Ported from @floating-ui/react FloatingFocusManager (+ markOthers, the focus-trap
// helpers, VisuallyHiddenDismiss). `.ts` component via createElement; React forwardRef
// → props.ref; `event.nativeEvent` → `event`. The trap works through direct DOM
// listeners (keydown/focusin/focusout) + markOthers (aria-hidden/inert) + return-focus,
// and the FocusGuards rely on octane's capture-phase focus delegation. Multiple roots
// are returned as an ARRAY (octane renders it like a React fragment).
import { getNodeName, isHTMLElement, isShadowRoot } from '@floating-ui/utils/dom';
import { focusable, isTabbable, tabbable } from 'tabbable';
import { createElement, useEffect, useMemo, useRef } from 'octane';
import type { OctaneNode } from 'octane';

import { FocusGuard, usePortalContext } from './FloatingPortal';
import { S } from './internal';
import { useFloatingTree } from './tree';
import {
	activeElement,
	clearTimeoutIfSet,
	contains,
	createAttribute,
	enqueueFocus,
	getDocument,
	getFloatingFocusElement,
	getNextTabbable,
	getNodeAncestors,
	getNodeChildren,
	getPreviousTabbable,
	getTabbableOptions,
	getTarget,
	isOutsideEvent,
	isTypeableCombobox,
	isVirtualClick,
	isVirtualPointerEvent,
	stopEvent,
	useEffectEvent,
	useLatestRef,
	useModernLayoutEffect,
	type CSSProperties,
} from './utils';
import type { FloatingRootContext, HTMLProps, MutableRefObject, RefCallback } from './types';

const HIDDEN_STYLES: CSSProperties = {
	border: 0,
	clip: 'rect(0 0 0 0)',
	height: '1px',
	margin: '-1px',
	overflow: 'hidden',
	padding: 0,
	position: 'fixed',
	whiteSpace: 'nowrap',
	width: '1px',
	top: 0,
	left: 0,
};

// ── markOthers (aria-hidden / inert the rest of the document) ────────────────
const counters: any = {
	inert: new WeakMap(),
	'aria-hidden': new WeakMap(),
	none: new WeakMap(),
};
function getCounterMap(control: any) {
	if (control === 'inert') return counters.inert;
	if (control === 'aria-hidden') return counters['aria-hidden'];
	return counters.none;
}
let uncontrolledElementsSet = new WeakSet<any>();
let markerMap: any = {};
let lockCount = 0;
export const supportsInert = (): boolean =>
	typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;
function unwrapHost(node: any): any {
	if (!node) {
		return null;
	}
	return isShadowRoot(node) ? (node as any).host : unwrapHost(node.parentNode);
}
const correctElements = (parent: any, targets: any[]) =>
	targets
		.map((target) => {
			if (parent.contains(target)) {
				return target;
			}
			const correctedTarget = unwrapHost(target);
			if (parent.contains(correctedTarget)) {
				return correctedTarget;
			}
			return null;
		})
		.filter((x) => x != null);
function applyAttributeToOthers(
	uncorrectedAvoidElements: any[],
	body: any,
	ariaHidden: boolean,
	inert: boolean,
): () => void {
	const markerName = 'data-floating-ui-inert';
	const controlAttribute = inert ? 'inert' : ariaHidden ? 'aria-hidden' : null;
	const avoidElements = correctElements(body, uncorrectedAvoidElements);
	const elementsToKeep = new Set<any>();
	const elementsToStop = new Set<any>(avoidElements);
	const hiddenElements: any[] = [];
	if (!markerMap[markerName]) {
		markerMap[markerName] = new WeakMap();
	}
	const markerCounter = markerMap[markerName];
	avoidElements.forEach(keep);
	deep(body);
	elementsToKeep.clear();
	function keep(el: any) {
		if (!el || elementsToKeep.has(el)) {
			return;
		}
		elementsToKeep.add(el);
		el.parentNode && keep(el.parentNode);
	}
	function deep(parent: any) {
		if (!parent || elementsToStop.has(parent)) {
			return;
		}
		[].forEach.call(parent.children, (node: any) => {
			if (getNodeName(node) === 'script') return;
			if (elementsToKeep.has(node)) {
				deep(node);
			} else {
				const attr = controlAttribute ? node.getAttribute(controlAttribute) : null;
				const alreadyHidden = attr !== null && attr !== 'false';
				const counterMap = getCounterMap(controlAttribute);
				const counterValue = (counterMap.get(node) || 0) + 1;
				const markerValue = (markerCounter.get(node) || 0) + 1;
				counterMap.set(node, counterValue);
				markerCounter.set(node, markerValue);
				hiddenElements.push(node);
				if (counterValue === 1 && alreadyHidden) {
					uncontrolledElementsSet.add(node);
				}
				if (markerValue === 1) {
					node.setAttribute(markerName, '');
				}
				if (!alreadyHidden && controlAttribute) {
					node.setAttribute(controlAttribute, controlAttribute === 'inert' ? '' : 'true');
				}
			}
		});
	}
	lockCount++;
	return () => {
		hiddenElements.forEach((element) => {
			const counterMap = getCounterMap(controlAttribute);
			const currentCounterValue = counterMap.get(element) || 0;
			const counterValue = currentCounterValue - 1;
			const markerValue = (markerCounter.get(element) || 0) - 1;
			counterMap.set(element, counterValue);
			markerCounter.set(element, markerValue);
			if (!counterValue) {
				if (!uncontrolledElementsSet.has(element) && controlAttribute) {
					element.removeAttribute(controlAttribute);
				}
				uncontrolledElementsSet.delete(element);
			}
			if (!markerValue) {
				element.removeAttribute(markerName);
			}
		});
		lockCount--;
		if (!lockCount) {
			counters.inert = new WeakMap();
			counters['aria-hidden'] = new WeakMap();
			counters.none = new WeakMap();
			uncontrolledElementsSet = new WeakSet();
			markerMap = {};
		}
	};
}
function markOthers(avoidElements: any[], ariaHidden = false, inert = false): () => void {
	const body = getDocument(avoidElements[0]).body;
	return applyAttributeToOthers(
		avoidElements.concat(Array.from(body.querySelectorAll('[aria-live],[role="status"],output'))),
		body,
		ariaHidden,
		inert,
	);
}

// ── previously-focused element tracking (for return focus) ───────────────────
const LIST_LIMIT = 20;
let previouslyFocusedElements: Array<WeakRef<Element>> = [];
function clearDisconnectedPreviouslyFocusedElements() {
	previouslyFocusedElements = previouslyFocusedElements.filter(
		(elementRef) => elementRef.deref()?.isConnected,
	);
}
function addPreviouslyFocusedElement(element: Element | null | undefined) {
	clearDisconnectedPreviouslyFocusedElements();
	if (element && getNodeName(element) !== 'body') {
		previouslyFocusedElements.push(new WeakRef(element));
		if (previouslyFocusedElements.length > LIST_LIMIT) {
			previouslyFocusedElements = previouslyFocusedElements.slice(-LIST_LIMIT);
		}
	}
}
function getPreviouslyFocusedElement(): Element | undefined {
	clearDisconnectedPreviouslyFocusedElements();
	return previouslyFocusedElements[previouslyFocusedElements.length - 1]?.deref();
}
function getFirstTabbableElement(container: Element) {
	const tabbableOptions = getTabbableOptions();
	if (isTabbable(container, tabbableOptions)) {
		return container;
	}
	return tabbable(container, tabbableOptions)[0] || container;
}
function handleTabIndex(
	floatingFocusElement: HTMLElement,
	orderRef: MutableRefObject<Array<'reference' | 'floating' | 'content'>>,
) {
	if (
		!orderRef.current.includes('floating') &&
		!floatingFocusElement.getAttribute('role')?.includes('dialog')
	) {
		return;
	}
	const options = getTabbableOptions();
	const focusableElements = focusable(floatingFocusElement, options);
	const tabbableContent = focusableElements.filter((element) => {
		const dataTabIndex = element.getAttribute('data-tabindex') || '';
		return (
			isTabbable(element, options) ||
			(element.hasAttribute('data-tabindex') && !dataTabIndex.startsWith('-'))
		);
	});
	const tabIndex = floatingFocusElement.getAttribute('tabindex');
	if (orderRef.current.includes('floating') || tabbableContent.length === 0) {
		if (tabIndex !== '0') {
			floatingFocusElement.setAttribute('tabindex', '0');
		}
	} else if (
		tabIndex !== '-1' ||
		(floatingFocusElement.hasAttribute('data-tabindex') &&
			floatingFocusElement.getAttribute('data-tabindex') !== '-1')
	) {
		floatingFocusElement.setAttribute('tabindex', '-1');
		floatingFocusElement.setAttribute('data-tabindex', '-1');
	}
}

function useLiteMergeRefs<T>(
	refs: Array<MutableRefObject<T | null> | undefined>,
	slot: symbol,
): (value: T | null) => void {
	return useMemo(
		() => {
			return (value: T | null) => {
				refs.forEach((ref) => {
					if (ref) {
						ref.current = value;
					}
				});
			};
		},
		refs,
		slot,
	);
}

export function VisuallyHiddenDismiss(
	props: HTMLProps<HTMLButtonElement> & {
		ref?: MutableRefObject<HTMLButtonElement | null> | RefCallback<HTMLButtonElement> | null;
	},
): OctaneNode {
	return createElement('button', {
		...props,
		type: 'button',
		ref: props.ref,
		tabIndex: -1,
		style: HIDDEN_STYLES,
	});
}

export interface FloatingFocusManagerProps {
	children: OctaneNode;
	/**
	 * The floating context returned from `useFloatingRootContext` (a full
	 * `FloatingContext` from `useFloating` is structurally compatible).
	 */
	context: FloatingRootContext;
	/**
	 * Whether or not the focus manager should be disabled. Useful to delay focus
	 * management until after a transition completes or some other conditional
	 * state.
	 * @default false
	 */
	disabled?: boolean;
	/**
	 * The order in which focus cycles.
	 * @default ['content']
	 */
	order?: Array<'reference' | 'floating' | 'content'>;
	/**
	 * Which element to initially focus. Can be either a number (tabbable index as
	 * specified by the `order`) or a ref.
	 * @default 0
	 */
	initialFocus?: number | MutableRefObject<HTMLElement | null>;
	/**
	 * Determines if the focus guards are rendered. If not, focus can escape into
	 * the address bar/console/browser UI, like in native dialogs.
	 * @default true
	 */
	guards?: boolean;
	/**
	 * Determines if focus should be returned to the reference element once the
	 * floating element closes/unmounts (or if that is not available, the
	 * previously focused element). This prop is ignored if the floating element
	 * lost focus.
	 * It can be also set to a ref to explicitly control the element to return focus to.
	 * @default true
	 */
	returnFocus?: boolean | MutableRefObject<HTMLElement | null>;
	/**
	 * Determines if focus should be restored to the nearest tabbable element if
	 * focus inside the floating element is lost (such as due to the removal of
	 * the currently focused element from the DOM).
	 * @default false
	 */
	restoreFocus?: boolean;
	/**
	 * Determines if focus is “modal”, meaning focus is fully trapped inside the
	 * floating element and outside content cannot be accessed. This includes
	 * screen reader virtual cursors.
	 * @default true
	 */
	modal?: boolean;
	/**
	 * If your focus management is modal and there is no explicit close button
	 * available, you can use this prop to render a visually-hidden dismiss
	 * button at the start and end of the floating element. This allows
	 * touch-based screen readers to escape the floating element due to lack of
	 * an `esc` key.
	 * @default undefined
	 */
	visuallyHiddenDismiss?: boolean | string;
	/**
	 * Determines whether `focusout` event listeners that control whether the
	 * floating element should be closed if the focus moves outside of it are
	 * attached to the reference and floating elements. This affects non-modal
	 * focus management.
	 * @default true
	 */
	closeOnFocusOut?: boolean;
	/**
	 * Determines whether outside elements are `inert` when `modal` is enabled.
	 * This enables pointer modality without a backdrop.
	 * @default false
	 */
	outsideElementsInert?: boolean;
	/**
	 * Returns a list of elements that should be considered part of the
	 * floating element.
	 */
	getInsideElements?: () => Element[];
}

/**
 * Provides focus management for the floating element.
 * @see https://floating-ui.com/docs/FloatingFocusManager
 */
export function FloatingFocusManager(props: FloatingFocusManagerProps): OctaneNode {
	const context = props.context;
	const children = props.children;
	const disabled = props.disabled ?? false;
	const order = props.order ?? ['content'];
	const _guards = props.guards ?? true;
	const initialFocus = props.initialFocus ?? 0;
	const returnFocus = props.returnFocus ?? true;
	const restoreFocus = props.restoreFocus ?? false;
	const modal = props.modal ?? true;
	const visuallyHiddenDismiss = props.visuallyHiddenDismiss ?? false;
	const closeOnFocusOut = props.closeOnFocusOut ?? true;
	const outsideElementsInert = props.outsideElementsInert ?? false;
	const _getInsideElements = props.getInsideElements ?? (() => []);

	const open = context.open;
	const onOpenChange = context.onOpenChange;
	const events = context.events;
	const dataRef = context.dataRef;
	const domReference = context.elements.domReference;
	const floating = context.elements.floating;

	const getNodeId = useEffectEvent(
		() => dataRef.current.floatingContext?.nodeId,
		S('FFM:getNodeId'),
	);
	const getInsideElements = useEffectEvent(_getInsideElements, S('FFM:getInside'));
	const ignoreInitialFocus = typeof initialFocus === 'number' && initialFocus < 0;
	const isUntrappedTypeableCombobox = isTypeableCombobox(domReference) && ignoreInitialFocus;

	const inertSupported = supportsInert();
	const guards = inertSupported ? _guards : true;
	const useInert = !guards || (inertSupported && outsideElementsInert);
	const orderRef = useLatestRef(order, S('FFM:order'));
	const initialFocusRef = useLatestRef(initialFocus, S('FFM:initial'));
	const returnFocusRef = useLatestRef(returnFocus, S('FFM:return'));
	const tree = useFloatingTree();
	const portalContext = usePortalContext();
	const startDismissButtonRef = useRef<HTMLButtonElement | null>(null, S('FFM:startDismiss'));
	const endDismissButtonRef = useRef<HTMLButtonElement | null>(null, S('FFM:endDismiss'));
	const preventReturnFocusRef = useRef(false, S('FFM:preventReturn'));
	const isPointerDownRef = useRef(false, S('FFM:pointerDown'));
	const tabbableIndexRef = useRef(-1, S('FFM:tabbableIndex'));
	const blurTimeoutRef = useRef(-1, S('FFM:blurTimeout'));
	const isInsidePortal = portalContext != null;
	const floatingFocusElement = getFloatingFocusElement(floating);

	const getTabbableContent = useEffectEvent((container = floatingFocusElement) => {
		return container ? tabbable(container, getTabbableOptions()) : [];
	}, S('FFM:getContent'));
	const getTabbableElements = useEffectEvent((container?: HTMLElement) => {
		const content = getTabbableContent(container);
		return orderRef.current
			.map((type) => {
				if (domReference && type === 'reference') {
					return domReference;
				}
				if (floatingFocusElement && type === 'floating') {
					return floatingFocusElement;
				}
				return content;
			})
			.filter(Boolean)
			.flat();
	}, S('FFM:getEls'));

	useEffect(
		() => {
			if (disabled) return;
			if (!modal) return;
			function onKeyDown(event: KeyboardEvent) {
				if (event.key === 'Tab') {
					if (
						contains(
							floatingFocusElement,
							activeElement(getDocument(floatingFocusElement)) as any,
						) &&
						getTabbableContent().length === 0 &&
						!isUntrappedTypeableCombobox
					) {
						stopEvent(event);
					}
					const els = getTabbableElements();
					const target = getTarget(event);
					if (orderRef.current[0] === 'reference' && target === domReference) {
						stopEvent(event);
						if (event.shiftKey) {
							enqueueFocus(els[els.length - 1]);
						} else {
							enqueueFocus(els[1]);
						}
					}
					if (
						orderRef.current[1] === 'floating' &&
						target === floatingFocusElement &&
						event.shiftKey
					) {
						stopEvent(event);
						enqueueFocus(els[0]);
					}
				}
			}
			const doc = getDocument(floatingFocusElement);
			doc.addEventListener('keydown', onKeyDown);
			return () => {
				doc.removeEventListener('keydown', onKeyDown);
			};
		},
		[
			disabled,
			domReference,
			floatingFocusElement,
			modal,
			orderRef,
			isUntrappedTypeableCombobox,
			getTabbableContent,
			getTabbableElements,
		],
		S('FFM:e:keydown'),
	);

	useEffect(
		() => {
			if (disabled) return;
			if (!floating) return;
			function handleFocusIn(event: FocusEvent) {
				const target = getTarget(event);
				const tabbableContent = getTabbableContent();
				const tabbableIndex = tabbableContent.indexOf(target as any);
				if (tabbableIndex !== -1) {
					tabbableIndexRef.current = tabbableIndex;
				}
			}
			floating.addEventListener('focusin', handleFocusIn);
			return () => {
				floating.removeEventListener('focusin', handleFocusIn);
			};
		},
		[disabled, floating, getTabbableContent],
		S('FFM:e:focusin'),
	);

	useEffect(
		() => {
			if (disabled) return;
			if (!closeOnFocusOut) return;
			function handlePointerDown() {
				isPointerDownRef.current = true;
				setTimeout(() => {
					isPointerDownRef.current = false;
				});
			}
			function handleFocusOutside(event: FocusEvent) {
				const relatedTarget = event.relatedTarget as Element | null;
				const currentTarget = event.currentTarget;
				const target = getTarget(event);
				queueMicrotask(() => {
					const nodeId = getNodeId();
					const movedToUnrelatedNode = !(
						contains(domReference, relatedTarget) ||
						contains(floating, relatedTarget) ||
						contains(relatedTarget, floating) ||
						contains(portalContext?.portalNode, relatedTarget) ||
						(relatedTarget != null && relatedTarget.hasAttribute(createAttribute('focus-guard'))) ||
						(tree &&
							(getNodeChildren(tree.nodesRef.current, nodeId).find(
								(node: any) =>
									contains(node.context?.elements.floating, relatedTarget) ||
									contains(node.context?.elements.domReference, relatedTarget),
							) ||
								getNodeAncestors(tree.nodesRef.current, nodeId).find(
									(node: any) =>
										[
											node.context?.elements.floating,
											getFloatingFocusElement(node.context?.elements.floating),
										].includes(relatedTarget) ||
										node.context?.elements.domReference === relatedTarget,
								)))
					);
					if (currentTarget === domReference && floatingFocusElement) {
						handleTabIndex(floatingFocusElement, orderRef);
					}
					if (
						restoreFocus &&
						currentTarget !== domReference &&
						!(target as any)?.isConnected &&
						activeElement(getDocument(floatingFocusElement)) ===
							getDocument(floatingFocusElement).body
					) {
						if (isHTMLElement(floatingFocusElement)) {
							floatingFocusElement.focus();
						}
						const prevTabbableIndex = tabbableIndexRef.current;
						const tabbableContent = getTabbableContent();
						const nodeToFocus =
							tabbableContent[prevTabbableIndex] ||
							tabbableContent[tabbableContent.length - 1] ||
							floatingFocusElement;
						if (isHTMLElement(nodeToFocus)) {
							nodeToFocus.focus();
						}
					}
					if (dataRef.current.insideReactTree) {
						dataRef.current.insideReactTree = false;
						return;
					}
					if (
						(isUntrappedTypeableCombobox ? true : !modal) &&
						relatedTarget &&
						movedToUnrelatedNode &&
						!isPointerDownRef.current &&
						relatedTarget !== getPreviouslyFocusedElement()
					) {
						preventReturnFocusRef.current = true;
						onOpenChange(false, event, 'focus-out');
					}
				});
			}
			const shouldHandleBlurCapture = Boolean(!tree && portalContext);
			function markInsideReactTree() {
				clearTimeoutIfSet(blurTimeoutRef);
				dataRef.current.insideReactTree = true;
				blurTimeoutRef.current = window.setTimeout(() => {
					dataRef.current.insideReactTree = false;
				});
			}
			if (floating && isHTMLElement(domReference)) {
				domReference.addEventListener('focusout', handleFocusOutside);
				domReference.addEventListener('pointerdown', handlePointerDown);
				floating.addEventListener('focusout', handleFocusOutside);
				if (shouldHandleBlurCapture) {
					floating.addEventListener('focusout', markInsideReactTree, true);
				}
				return () => {
					domReference.removeEventListener('focusout', handleFocusOutside);
					domReference.removeEventListener('pointerdown', handlePointerDown);
					floating.removeEventListener('focusout', handleFocusOutside);
					if (shouldHandleBlurCapture) {
						floating.removeEventListener('focusout', markInsideReactTree, true);
					}
				};
			}
		},
		[
			disabled,
			domReference,
			floating,
			floatingFocusElement,
			modal,
			tree,
			portalContext,
			onOpenChange,
			closeOnFocusOut,
			restoreFocus,
			getTabbableContent,
			isUntrappedTypeableCombobox,
			getNodeId,
			orderRef,
			dataRef,
		],
		S('FFM:e:focusout'),
	);

	const beforeGuardRef = useRef<HTMLSpanElement | null>(null, S('FFM:beforeGuard'));
	const afterGuardRef = useRef<HTMLSpanElement | null>(null, S('FFM:afterGuard'));
	const mergedBeforeGuardRef = useLiteMergeRefs(
		[beforeGuardRef, portalContext?.beforeInsideRef],
		S('FFM:mergeBefore'),
	);
	const mergedAfterGuardRef = useLiteMergeRefs(
		[afterGuardRef, portalContext?.afterInsideRef],
		S('FFM:mergeAfter'),
	);

	useEffect(
		() => {
			if (disabled) return;
			if (!floating) return;
			const portalNodes = Array.from(
				portalContext?.portalNode?.querySelectorAll('[' + createAttribute('portal') + ']') || [],
			);
			const ancestors = tree ? getNodeAncestors(tree.nodesRef.current, getNodeId()) : [];
			const rootAncestorComboboxDomReference = ancestors.find((node: any) =>
				isTypeableCombobox(node.context?.elements.domReference || null),
			)?.context?.elements.domReference;
			const insideElements = [
				floating,
				rootAncestorComboboxDomReference,
				...portalNodes,
				...getInsideElements(),
				startDismissButtonRef.current,
				endDismissButtonRef.current,
				beforeGuardRef.current,
				afterGuardRef.current,
				portalContext?.beforeOutsideRef.current,
				portalContext?.afterOutsideRef.current,
				orderRef.current.includes('reference') || isUntrappedTypeableCombobox ? domReference : null,
			].filter((x) => x != null);
			const cleanup =
				modal || isUntrappedTypeableCombobox
					? markOthers(insideElements, !useInert, useInert)
					: markOthers(insideElements);
			return () => {
				cleanup();
			};
		},
		[
			disabled,
			domReference,
			floating,
			modal,
			orderRef,
			portalContext,
			isUntrappedTypeableCombobox,
			guards,
			useInert,
			tree,
			getNodeId,
			getInsideElements,
		],
		S('FFM:e:markOthers'),
	);

	useModernLayoutEffect(
		() => {
			if (disabled || !isHTMLElement(floatingFocusElement)) return;
			const previouslyFocusedElement = activeElement(getDocument(floatingFocusElement));
			queueMicrotask(() => {
				const focusableElements = getTabbableElements(floatingFocusElement);
				const initialFocusValue = initialFocusRef.current;
				const elToFocus =
					(typeof initialFocusValue === 'number'
						? focusableElements[initialFocusValue]
						: initialFocusValue.current) || floatingFocusElement;
				const focusAlreadyInsideFloatingEl = contains(
					floatingFocusElement,
					previouslyFocusedElement as any,
				);
				if (!ignoreInitialFocus && !focusAlreadyInsideFloatingEl && open) {
					enqueueFocus(elToFocus, { preventScroll: elToFocus === floatingFocusElement });
				}
			});
		},
		[
			disabled,
			open,
			floatingFocusElement,
			ignoreInitialFocus,
			getTabbableElements,
			initialFocusRef,
		],
		S('FFM:e:initialFocus'),
	);

	useModernLayoutEffect(
		() => {
			if (disabled || !floatingFocusElement) return;
			const doc = getDocument(floatingFocusElement);
			const previouslyFocusedElement = activeElement(doc);
			addPreviouslyFocusedElement(previouslyFocusedElement);

			function onOpenChangeLocal(_ref: any) {
				const { reason, event, nested } = _ref;
				if (['hover', 'safe-polygon'].includes(reason) && event.type === 'mouseleave') {
					preventReturnFocusRef.current = true;
				}
				if (reason !== 'outside-press') return;
				if (nested) {
					preventReturnFocusRef.current = false;
				} else if (isVirtualClick(event) || isVirtualPointerEvent(event)) {
					preventReturnFocusRef.current = false;
				} else {
					let isPreventScrollSupported = false;
					document.createElement('div').focus({
						get preventScroll() {
							isPreventScrollSupported = true;
							return false;
						},
					} as any);
					preventReturnFocusRef.current = !isPreventScrollSupported;
				}
			}
			events.on('openchange', onOpenChangeLocal);
			const fallbackEl = doc.createElement('span');
			fallbackEl.setAttribute('tabindex', '-1');
			fallbackEl.setAttribute('aria-hidden', 'true');
			Object.assign(fallbackEl.style, HIDDEN_STYLES);
			if (isInsidePortal && domReference) {
				domReference.insertAdjacentElement('afterend', fallbackEl);
			}
			function getReturnElement() {
				if (typeof returnFocusRef.current === 'boolean') {
					const el = domReference || getPreviouslyFocusedElement();
					return el && el.isConnected ? el : fallbackEl;
				}
				return returnFocusRef.current.current || fallbackEl;
			}
			return () => {
				events.off('openchange', onOpenChangeLocal);
				const activeEl = activeElement(doc);
				const isFocusInsideFloatingTree =
					contains(floating, activeEl as any) ||
					(tree &&
						getNodeChildren(tree.nodesRef.current, getNodeId(), false).some((node: any) =>
							contains(node.context?.elements.floating, activeEl as any),
						));
				const returnElement = getReturnElement();
				queueMicrotask(() => {
					const tabbableReturnElement = getFirstTabbableElement(returnElement);
					if (
						returnFocusRef.current &&
						!preventReturnFocusRef.current &&
						isHTMLElement(tabbableReturnElement) &&
						(tabbableReturnElement !== activeEl && activeEl !== doc.body
							? isFocusInsideFloatingTree
							: true)
					) {
						tabbableReturnElement.focus({ preventScroll: true });
					}
					fallbackEl.remove();
				});
			};
		},
		[
			disabled,
			floating,
			floatingFocusElement,
			returnFocusRef,
			dataRef,
			events,
			tree,
			isInsidePortal,
			domReference,
			getNodeId,
		],
		S('FFM:e:returnFocus'),
	);

	useEffect(
		() => {
			queueMicrotask(() => {
				preventReturnFocusRef.current = false;
			});
			return () => {
				queueMicrotask(clearDisconnectedPreviouslyFocusedElements);
			};
		},
		[disabled],
		S('FFM:e:resetReturn'),
	);

	useModernLayoutEffect(
		() => {
			if (disabled) return;
			if (!portalContext) return;
			portalContext.setFocusManagerState({
				modal,
				closeOnFocusOut,
				open,
				onOpenChange,
				domReference,
			});
			return () => {
				portalContext.setFocusManagerState(null);
			};
		},
		[disabled, portalContext, modal, open, onOpenChange, closeOnFocusOut, domReference],
		S('FFM:e:portalState'),
	);

	useModernLayoutEffect(
		() => {
			if (disabled) return;
			if (!floatingFocusElement) return;
			handleTabIndex(floatingFocusElement, orderRef);
		},
		[disabled, floatingFocusElement, orderRef],
		S('FFM:e:tabIndex'),
	);

	function renderDismissButton(location: 'start' | 'end') {
		if (disabled || !visuallyHiddenDismiss || !modal) {
			return null;
		}
		return createElement(VisuallyHiddenDismiss, {
			ref: location === 'start' ? startDismissButtonRef : endDismissButtonRef,
			onClick: (event: MouseEvent) => onOpenChange(false, event),
			children: typeof visuallyHiddenDismiss === 'string' ? visuallyHiddenDismiss : 'Dismiss',
		});
	}

	const shouldRenderGuards =
		!disabled &&
		guards &&
		(modal ? !isUntrappedTypeableCombobox : true) &&
		(isInsidePortal || modal);

	return [
		shouldRenderGuards &&
			createElement(FocusGuard, {
				'data-type': 'inside',
				ref: mergedBeforeGuardRef,
				onFocus: (event: FocusEvent) => {
					if (modal) {
						const els = getTabbableElements();
						enqueueFocus(order[0] === 'reference' ? els[0] : els[els.length - 1]);
					} else if (
						portalContext != null &&
						portalContext.preserveTabOrder &&
						portalContext.portalNode
					) {
						preventReturnFocusRef.current = false;
						if (isOutsideEvent(event, portalContext.portalNode)) {
							getNextTabbable(domReference)?.focus();
						} else {
							portalContext.beforeOutsideRef.current?.focus();
						}
					}
				},
			}),
		!isUntrappedTypeableCombobox && renderDismissButton('start'),
		children,
		renderDismissButton('end'),
		shouldRenderGuards &&
			createElement(FocusGuard, {
				'data-type': 'inside',
				ref: mergedAfterGuardRef,
				onFocus: (event: FocusEvent) => {
					if (modal) {
						enqueueFocus(getTabbableElements()[0]);
					} else if (
						portalContext != null &&
						portalContext.preserveTabOrder &&
						portalContext.portalNode
					) {
						if (closeOnFocusOut) {
							preventReturnFocusRef.current = true;
						}
						if (isOutsideEvent(event, portalContext.portalNode)) {
							getPreviousTabbable(domReference)?.focus();
						} else {
							portalContext.afterOutsideRef.current?.focus();
						}
					}
				},
			}),
	];
}
