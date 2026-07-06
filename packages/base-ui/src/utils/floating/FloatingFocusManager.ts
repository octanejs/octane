// Ported from .base-ui/packages/react/src/floating-ui-react/components/FloatingFocusManager.tsx
// (v1.6.0), octane-adapted: reads the FloatingRootStore (`store.useState`/`context`/`setOpen`);
// native events; `useMergedRefs` → `useComposedRefs`; `useIsoLayoutEffect` → `useLayoutEffect`;
// every hook threads an explicit slot; returns `[beforeGuard?, children, afterGuard?]`. Traps focus
// inside the popup, hides the rest of the page from assistive tech (`markOthers`), restores focus on
// close. Emits `data-base-ui-*` attributes for parity with Base UI.
import { createElement, useState, useRef, useEffect, useLayoutEffect } from 'octane';
import { getNodeName, isHTMLElement } from '@floating-ui/utils/dom';

import { S, subSlot } from '../../internal';
import { addEventListener } from '../addEventListener';
import { mergeCleanups } from '../mergeCleanups';
import { useComposedRefs } from '../composeRefs';
import { useValueAsRef } from '../useValueAsRef';
import { useStableCallback } from '../useStableCallback';
import { useTimeout } from '../useTimeout';
import { useAnimationFrame } from '../useAnimationFrame';
import { platform } from '../platform';
import { ownerDocument, ownerWindow } from '../owner';
import { resolveRef } from '../resolveRef';
import type { InteractionType } from '../useEnhancedClickHandler';
import { FocusGuard } from './FocusGuard';
import {
	activeElement,
	contains,
	getTarget,
	isTypeableCombobox,
	getFloatingFocusElement,
	isTypeableElement,
} from './element';
import { isVirtualClick, isVirtualPointerEvent } from './event';
import { stopEvent } from '../composite/list-utils';
import {
	tabbable,
	focusable,
	isOutsideEvent,
	isTabbable,
	getNextTabbable,
	getPreviousTabbable,
	type FocusableElement,
} from './tabbable';
import { getNodeAncestors, getNodeChildren } from './nodes';
import { isElementVisible } from './composite';
import type { FloatingContext, FloatingRootContext } from './types';
import { createChangeEventDetails, REASONS } from '../createChangeEventDetails';
import { createAttribute } from './createAttribute';
import { CLICK_TRIGGER_IDENTIFIER } from './constants';
import { enqueueFocus } from './enqueueFocus';
import { markOthers } from './markOthers';
import { usePortalContext } from './FloatingPortal';
import { useFloatingTree } from './FloatingTree';
import type { FloatingTreeStore } from './FloatingTreeStore';

interface FloatingUIOpenChangeDetails {
	open: boolean;
	reason: string;
	nativeEvent: Event;
	nested: boolean;
	triggerElement?: Element | undefined;
}

function getEventType(event: Event, lastInteractionType?: InteractionType): InteractionType {
	const win = ownerWindow(getTarget(event) as any);
	if (event instanceof win.KeyboardEvent) {
		return 'keyboard';
	}
	if (event instanceof win.FocusEvent) {
		return lastInteractionType || 'keyboard';
	}
	if ('pointerType' in event) {
		return ((event as PointerEvent).pointerType as InteractionType) || 'keyboard';
	}
	if ('touches' in event) {
		return 'touch';
	}
	if (event instanceof win.MouseEvent) {
		return lastInteractionType || ((event as MouseEvent).detail === 0 ? 'keyboard' : 'mouse');
	}
	return '';
}

const LIST_LIMIT = 20;
let previouslyFocusedElements: WeakRef<Element>[] = [];

function clearDisconnectedPreviouslyFocusedElements() {
	previouslyFocusedElements = previouslyFocusedElements.filter(
		(entry) => entry.deref()?.isConnected,
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

function getPreviouslyFocusedElement() {
	clearDisconnectedPreviouslyFocusedElements();
	return previouslyFocusedElements[previouslyFocusedElements.length - 1]?.deref();
}

function getFirstTabbableElement(container: Element | null) {
	if (!container) {
		return null;
	}
	if (isTabbable(container)) {
		return container;
	}
	return tabbable(container)[0] || container;
}

function handleTabIndex(floatingFocusElement: HTMLElement) {
	if (
		floatingFocusElement.hasAttribute('tabindex') &&
		!floatingFocusElement.hasAttribute('data-tabindex')
	) {
		return;
	}
	if (!floatingFocusElement.getAttribute('role')?.includes('dialog')) {
		return;
	}
	const focusableElements = focusable(floatingFocusElement);
	const tabbableContent = focusableElements.filter((element) => {
		const dataTabIndex = element.getAttribute('data-tabindex') || '';
		return (
			isTabbable(element) ||
			(element.hasAttribute('data-tabindex') && !dataTabIndex.startsWith('-'))
		);
	});
	const tabIndex = floatingFocusElement.getAttribute('tabindex');
	if (tabbableContent.length === 0) {
		if (tabIndex !== '0') {
			floatingFocusElement.setAttribute('tabindex', '0');
			floatingFocusElement.setAttribute('data-tabindex', '0');
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

export function FloatingFocusManager(props: {
	context: FloatingRootContext | FloatingContext;
	children: any;
	disabled?: boolean;
	initialFocus?: any;
	returnFocus?: any;
	restoreFocus?: boolean | 'popup';
	modal?: boolean;
	closeOnFocusOut?: boolean;
	openInteractionType?: InteractionType | null;
	nextFocusableElement?: any;
	previousFocusableElement?: any;
	beforeContentFocusGuardRef?: any;
	externalTree?: FloatingTreeStore;
	getInsideElements?: () => Array<Element | null | undefined>;
}): any {
	const slot = S('FloatingFocusManager');
	const {
		context,
		children,
		disabled = false,
		initialFocus = true,
		returnFocus = true,
		restoreFocus = false,
		modal = true,
		closeOnFocusOut = true,
		openInteractionType = '',
		nextFocusableElement,
		previousFocusableElement,
		beforeContentFocusGuardRef,
		externalTree,
		getInsideElements,
	} = props;

	const store = (context && 'rootStore' in context ? context.rootStore : context) as any;

	const open = store.useState('open', subSlot(slot, 'open'));
	const domReference = store.useState('domReferenceElement', subSlot(slot, 'dom'));
	const floating = store.useState('floatingElement', subSlot(slot, 'fel'));
	const { events, dataRef } = store.context;

	const getNodeId = useStableCallback(
		() => dataRef.current.floatingContext?.nodeId,
		subSlot(slot, 'getNodeId'),
	);

	const ignoreInitialFocus = initialFocus === false;
	const isUntrappedTypeableCombobox = isTypeableCombobox(domReference) && ignoreInitialFocus;

	const initialFocusRef = useValueAsRef(initialFocus, subSlot(slot, 'ifr'));
	const returnFocusRef = useValueAsRef(returnFocus, subSlot(slot, 'rfr'));
	const openInteractionTypeRef = useValueAsRef(openInteractionType, subSlot(slot, 'oitr'));
	const openRef = useValueAsRef(open, subSlot(slot, 'openRef'));

	const tree = useFloatingTree(externalTree);
	const portalContext = usePortalContext();

	const preventReturnFocusRef = useRef(false, subSlot(slot, 'prf'));
	const isPointerDownRef = useRef(false, subSlot(slot, 'ipd'));
	const pointerDownOutsideRef = useRef(false, subSlot(slot, 'pdo'));
	const lastFocusedTabbableRef = useRef<FocusableElement | null>(null, subSlot(slot, 'lft'));
	const closeTypeRef = useRef<InteractionType>('', subSlot(slot, 'ct'));
	const lastInteractionTypeRef = useRef<InteractionType>('', subSlot(slot, 'lit'));

	const beforeGuardRef = useRef<HTMLSpanElement | null>(null, subSlot(slot, 'bg'));
	const afterGuardRef = useRef<HTMLSpanElement | null>(null, subSlot(slot, 'ag'));

	const mergedBeforeGuardRef = useComposedRefs(
		beforeGuardRef,
		beforeContentFocusGuardRef,
		portalContext?.beforeInsideRef,
		subSlot(slot, 'mbg'),
	);
	const mergedAfterGuardRef = useComposedRefs(
		afterGuardRef,
		portalContext?.afterInsideRef,
		subSlot(slot, 'mag'),
	);

	const blurTimeout = useTimeout(subSlot(slot, 'bt'));
	const pointerDownTimeout = useTimeout(subSlot(slot, 'pdt'));
	const restoreFocusFrame = useAnimationFrame(subSlot(slot, 'rff'));

	const isInsidePortal = portalContext != null;
	const floatingFocusElement = getFloatingFocusElement(floating);

	const getTabbableContent = useStableCallback(
		(container: Element | null = floatingFocusElement) => {
			return container ? tabbable(container) : [];
		},
		subSlot(slot, 'gtc'),
	);

	const getResolvedInsideElements = useStableCallback(
		() => getInsideElements?.().filter((element): element is Element => element != null) ?? [],
		subSlot(slot, 'grie'),
	);

	// Prevent Tab from escaping the modal when there are no tabbable elements.
	useEffect(
		() => {
			if (disabled || !modal) {
				return undefined;
			}
			function onKeyDown(event: KeyboardEvent) {
				if (event.key === 'Tab') {
					if (
						contains(floatingFocusElement, activeElement(ownerDocument(floatingFocusElement))) &&
						getTabbableContent().length === 0 &&
						!isUntrappedTypeableCombobox
					) {
						stopEvent(event);
					}
				}
			}
			const doc = ownerDocument(floatingFocusElement);
			return addEventListener(doc, 'keydown', onKeyDown as EventListener);
		},
		[disabled, floatingFocusElement, modal, isUntrappedTypeableCombobox, getTabbableContent],
		subSlot(slot, 'e:tab'),
	);

	// Track pointer/keyboard interactions.
	useEffect(
		() => {
			if (disabled || !open) {
				return undefined;
			}
			const doc = ownerDocument(floatingFocusElement);
			function clearPointerDownOutside() {
				pointerDownOutsideRef.current = false;
			}
			function onPointerDown(event: PointerEvent) {
				const target = getTarget(event) as Element | null;
				const insideElements = getResolvedInsideElements();
				const pointerTargetInside =
					contains(floating, target) ||
					contains(domReference, target) ||
					contains(portalContext?.portalNode, target) ||
					insideElements.some(
						(element: Element) => element === target || contains(element, target),
					);
				pointerDownOutsideRef.current = !pointerTargetInside;
				lastInteractionTypeRef.current = (event.pointerType as InteractionType) || 'keyboard';
				if (target?.closest(`[${CLICK_TRIGGER_IDENTIFIER}]`)) {
					isPointerDownRef.current = true;
					pointerDownTimeout.start(0, () => {
						isPointerDownRef.current = false;
					});
				}
			}
			function onKeyDown() {
				lastInteractionTypeRef.current = 'keyboard';
			}
			return mergeCleanups(
				addEventListener(doc, 'pointerdown', onPointerDown as EventListener, true),
				addEventListener(doc, 'pointerup', clearPointerDownOutside, true),
				addEventListener(doc, 'pointercancel', clearPointerDownOutside, true),
				addEventListener(doc, 'keydown', onKeyDown, true),
				clearPointerDownOutside,
			);
		},
		[
			disabled,
			floating,
			domReference,
			floatingFocusElement,
			open,
			portalContext,
			pointerDownTimeout,
			getResolvedInsideElements,
		],
		subSlot(slot, 'e:track'),
	);

	// Close on focus out + restore focus within the floating tree.
	useEffect(
		() => {
			if (disabled || !closeOnFocusOut) {
				return undefined;
			}
			const doc = ownerDocument(floatingFocusElement);
			function handlePointerDown() {
				isPointerDownRef.current = true;
				pointerDownTimeout.start(0, () => {
					isPointerDownRef.current = false;
				});
			}
			function handleFocusIn(event: FocusEvent) {
				const target = getTarget(event) as FocusableElement | null;
				if (isTabbable(target)) {
					lastFocusedTabbableRef.current = target;
				}
			}
			function handleFocusOutside(event: FocusEvent) {
				const relatedTarget = event.relatedTarget as HTMLElement | null;
				const currentTarget = event.currentTarget;
				const target = getTarget(event) as HTMLElement | null;
				if (modal && relatedTarget == null && target != null && contains(floating, target)) {
					addPreviouslyFocusedElement(target);
				}
				queueMicrotask(() => {
					const nodeId = getNodeId();
					const triggers = store.context.triggerElements;
					const insideElements = getResolvedInsideElements();
					const isRelatedFocusGuard =
						relatedTarget?.hasAttribute(createAttribute('focus-guard')) &&
						[
							beforeGuardRef.current,
							afterGuardRef.current,
							portalContext?.beforeInsideRef.current,
							portalContext?.afterInsideRef.current,
							portalContext?.beforeOutsideRef.current,
							portalContext?.afterOutsideRef.current,
							resolveRef(previousFocusableElement),
							resolveRef(nextFocusableElement),
						].includes(relatedTarget);
					const movedToUnrelatedNode = !(
						contains(domReference, relatedTarget) ||
						contains(floating, relatedTarget) ||
						contains(relatedTarget, floating) ||
						contains(portalContext?.portalNode, relatedTarget) ||
						insideElements.some(
							(element: Element) => element === relatedTarget || contains(element, relatedTarget),
						) ||
						(relatedTarget != null && triggers.hasElement(relatedTarget)) ||
						triggers.hasMatchingElement((trigger: Element) => contains(trigger, relatedTarget)) ||
						isRelatedFocusGuard ||
						(tree &&
							(getNodeChildren(tree.nodesRef.current, nodeId).find(
								(node) =>
									contains(node.context?.elements.floating, relatedTarget) ||
									contains(node.context?.elements.domReference, relatedTarget),
							) ||
								getNodeAncestors(tree.nodesRef.current, nodeId).find(
									(node) =>
										[
											node.context?.elements.floating,
											getFloatingFocusElement(node.context?.elements.floating),
										].includes(relatedTarget) ||
										node.context?.elements.domReference === relatedTarget,
								)))
					);
					if (currentTarget === domReference && floatingFocusElement) {
						handleTabIndex(floatingFocusElement);
					}
					if (
						restoreFocus &&
						currentTarget !== domReference &&
						!isElementVisible(target) &&
						activeElement(doc) === doc.body
					) {
						if (isHTMLElement(floatingFocusElement)) {
							floatingFocusElement.focus();
							if (restoreFocus === 'popup') {
								restoreFocusFrame.request(() => {
									floatingFocusElement.focus();
								});
								return;
							}
						}
						const tabbableContent = getTabbableContent() as Array<Element | null>;
						const prevTabbable = lastFocusedTabbableRef.current;
						const nodeToFocus =
							(prevTabbable && tabbableContent.includes(prevTabbable) ? prevTabbable : null) ||
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
						(isUntrappedTypeableCombobox || relatedTarget !== getPreviouslyFocusedElement())
					) {
						preventReturnFocusRef.current = true;
						store.setOpen(false, createChangeEventDetails(REASONS.focusOut, event));
					}
				});
			}
			function markInsideReactTree() {
				if (pointerDownOutsideRef.current) {
					return;
				}
				dataRef.current.insideReactTree = true;
				blurTimeout.start(0, () => {
					dataRef.current.insideReactTree = false;
				});
			}
			const domReferenceElement = isHTMLElement(domReference) ? domReference : null;
			if (!floating && !domReferenceElement) {
				return undefined;
			}
			return mergeCleanups(
				domReferenceElement &&
					addEventListener(domReferenceElement, 'focusout', handleFocusOutside as EventListener),
				domReferenceElement &&
					addEventListener(domReferenceElement, 'pointerdown', handlePointerDown),
				floating && addEventListener(floating, 'focusin', handleFocusIn as EventListener),
				floating && addEventListener(floating, 'focusout', handleFocusOutside as EventListener),
				floating &&
					portalContext &&
					addEventListener(floating, 'focusout', markInsideReactTree as EventListener, true),
			);
		},
		[
			disabled,
			domReference,
			floating,
			floatingFocusElement,
			modal,
			tree,
			portalContext,
			store,
			closeOnFocusOut,
			restoreFocus,
			getTabbableContent,
			isUntrappedTypeableCombobox,
			getNodeId,
			dataRef,
			blurTimeout,
			pointerDownTimeout,
			restoreFocusFrame,
			nextFocusableElement,
			previousFocusableElement,
			getResolvedInsideElements,
		],
		subSlot(slot, 'e:focusout'),
	);

	// Hide everything outside the floating tree from assistive tech while open.
	useEffect(
		() => {
			if (disabled || !floating || !open) {
				return undefined;
			}
			const portalNodes = Array.from(
				portalContext?.portalNode?.querySelectorAll(`[${createAttribute('portal')}]`) || [],
			);
			const ancestors = tree ? getNodeAncestors(tree.nodesRef.current, getNodeId()) : [];
			const rootAncestorComboboxDomReference = ancestors.find((node) =>
				isTypeableCombobox(node.context?.elements.domReference || null),
			)?.context?.elements.domReference;
			const controlInsideElements = [
				floating,
				...portalNodes,
				beforeGuardRef.current,
				afterGuardRef.current,
				portalContext?.beforeOutsideRef.current,
				portalContext?.afterOutsideRef.current,
				...getResolvedInsideElements(),
			];
			const insideElements = [
				...controlInsideElements,
				rootAncestorComboboxDomReference,
				resolveRef(previousFocusableElement),
				resolveRef(nextFocusableElement),
				isUntrappedTypeableCombobox ? domReference : null,
			].filter((x): x is Element => x != null);
			const ariaHiddenCleanup = markOthers(insideElements, {
				ariaHidden: modal || isUntrappedTypeableCombobox,
				mark: false,
			});
			const markerInsideElements = [floating, ...portalNodes].filter(
				(x): x is Element => x != null,
			);
			const markerCleanup = markOthers(markerInsideElements);
			return () => {
				markerCleanup();
				ariaHiddenCleanup();
			};
		},
		[
			open,
			disabled,
			domReference,
			floating,
			modal,
			portalContext,
			isUntrappedTypeableCombobox,
			tree,
			getNodeId,
			nextFocusableElement,
			previousFocusableElement,
			getResolvedInsideElements,
		],
		subSlot(slot, 'e:hide'),
	);

	// Focus the initial element when the floating element opens.
	useLayoutEffect(
		() => {
			if (!open || disabled || !isHTMLElement(floatingFocusElement)) {
				return;
			}
			const doc = ownerDocument(floatingFocusElement);
			const previouslyFocused = activeElement(doc);
			queueMicrotask(() => {
				const initialFocusValueOrFn = initialFocusRef.current;
				const resolvedInitialFocus =
					typeof initialFocusValueOrFn === 'function'
						? initialFocusValueOrFn(openInteractionTypeRef.current || '')
						: initialFocusValueOrFn;
				if (resolvedInitialFocus === undefined || resolvedInitialFocus === false) {
					return;
				}
				const focusAlreadyInsideFloatingEl = contains(floatingFocusElement, previouslyFocused);
				if (focusAlreadyInsideFloatingEl) {
					return;
				}
				let focusableElements: Array<FocusableElement> | null = null;
				const getDefaultFocusElement = () => {
					if (focusableElements == null) {
						focusableElements = getTabbableContent(floatingFocusElement) as FocusableElement[];
					}
					return focusableElements[0] || floatingFocusElement;
				};
				let elToFocus: FocusableElement | null | undefined;
				if (resolvedInitialFocus === true || resolvedInitialFocus === null) {
					elToFocus = getDefaultFocusElement();
				} else {
					elToFocus = resolveRef(resolvedInitialFocus);
				}
				elToFocus = elToFocus || getDefaultFocusElement();
				const hadFocusInside = contains(floatingFocusElement, activeElement(doc));
				enqueueFocus(elToFocus, {
					preventScroll: elToFocus === floatingFocusElement,
					shouldFocus() {
						if (!openRef.current) {
							return false;
						}
						if (hadFocusInside) {
							return true;
						}
						const currentActiveElement = activeElement(doc);
						const focusMovedInside =
							currentActiveElement !== elToFocus &&
							contains(floatingFocusElement, currentActiveElement);
						return !focusMovedInside;
					},
				});
			});
		},
		[
			disabled,
			open,
			floatingFocusElement,
			getTabbableContent,
			initialFocusRef,
			openInteractionTypeRef,
			openRef,
		],
		subSlot(slot, 'e:initfocus'),
	);

	// Track return-focus targets and restore focus on unmount/close.
	useLayoutEffect(
		() => {
			if (disabled || !floatingFocusElement) {
				return undefined;
			}
			const doc = ownerDocument(floatingFocusElement);
			const elementFocusedBeforeOpen = activeElement(doc);
			const preferPreviousFocus = openInteractionTypeRef.current == null;
			addPreviouslyFocusedElement(elementFocusedBeforeOpen);
			function onOpenChangeLocal(details: FloatingUIOpenChangeDetails) {
				if (!details.open) {
					closeTypeRef.current = getEventType(details.nativeEvent, lastInteractionTypeRef.current);
				}
				if (details.reason === REASONS.triggerHover && details.nativeEvent.type === 'mouseleave') {
					preventReturnFocusRef.current = true;
				}
				if (details.reason !== REASONS.outsidePress) {
					return;
				}
				if (details.nested) {
					preventReturnFocusRef.current = false;
				} else if (
					isVirtualClick(details.nativeEvent as MouseEvent) ||
					isVirtualPointerEvent(details.nativeEvent as PointerEvent)
				) {
					preventReturnFocusRef.current = false;
				} else {
					let isPreventScrollSupported = false;
					ownerDocument(floatingFocusElement)
						.createElement('div')
						.focus({
							get preventScroll() {
								isPreventScrollSupported = true;
								return false;
							},
						} as any);
					if (isPreventScrollSupported) {
						preventReturnFocusRef.current = false;
					} else {
						preventReturnFocusRef.current = true;
					}
				}
			}
			events.on('openchange', onOpenChangeLocal);
			function getReturnElement() {
				const returnFocusValueOrFn = returnFocusRef.current;
				let resolvedReturnFocusValue =
					typeof returnFocusValueOrFn === 'function'
						? returnFocusValueOrFn(closeTypeRef.current)
						: returnFocusValueOrFn;
				if (resolvedReturnFocusValue === undefined || resolvedReturnFocusValue === false) {
					return null;
				}
				if (resolvedReturnFocusValue === null) {
					resolvedReturnFocusValue = true;
				}
				const referenceReturnElement = domReference?.isConnected ? domReference : null;
				const previousReturnElement =
					elementFocusedBeforeOpen?.isConnected && getNodeName(elementFocusedBeforeOpen) !== 'body'
						? elementFocusedBeforeOpen
						: null;
				let defaultReturnElement = preferPreviousFocus
					? previousReturnElement || referenceReturnElement
					: referenceReturnElement || previousReturnElement;
				if (!defaultReturnElement) {
					defaultReturnElement = getPreviouslyFocusedElement() || null;
				}
				if (typeof resolvedReturnFocusValue === 'boolean') {
					return defaultReturnElement;
				}
				return resolveRef(resolvedReturnFocusValue) || defaultReturnElement || null;
			}
			return () => {
				events.off('openchange', onOpenChangeLocal);
				const activeEl = activeElement(doc);
				const insideElements = getResolvedInsideElements();
				const isFocusInsideFloatingTree =
					contains(floating, activeEl) ||
					insideElements.some(
						(element: Element) => element === activeEl || contains(element, activeEl),
					) ||
					(tree &&
						getNodeChildren(tree.nodesRef.current, getNodeId(), false).some((node) =>
							contains(node.context?.elements.floating, activeEl),
						));
				const returnFocusValueOrFn = returnFocusRef.current;
				const returnElement = getReturnElement();
				queueMicrotask(() => {
					const tabbableReturnElement = getFirstTabbableElement(returnElement);
					const hasExplicitReturnFocus = typeof returnFocusValueOrFn !== 'boolean';
					if (
						returnFocusValueOrFn &&
						!preventReturnFocusRef.current &&
						isHTMLElement(tabbableReturnElement) &&
						(!hasExplicitReturnFocus && tabbableReturnElement !== activeEl && activeEl !== doc.body
							? isFocusInsideFloatingTree
							: true)
					) {
						tabbableReturnElement.focus({ preventScroll: true });
					}
					preventReturnFocusRef.current = false;
				});
			};
		},
		[
			disabled,
			floating,
			floatingFocusElement,
			returnFocusRef,
			openInteractionTypeRef,
			events,
			tree,
			domReference,
			getNodeId,
			getResolvedInsideElements,
		],
		subSlot(slot, 'e:returnfocus'),
	);

	// Safari: blur a typeable input before the popup unmounts (avoids a scroll jump).
	useLayoutEffect(
		() => {
			if (!platform.engine.webkit || open || !floating) {
				return;
			}
			const activeEl = activeElement(ownerDocument(floating));
			if (!isHTMLElement(activeEl) || !isTypeableElement(activeEl)) {
				return;
			}
			if (contains(floating, activeEl)) {
				activeEl.blur();
			}
		},
		[open, floating],
		subSlot(slot, 'e:webkit'),
	);

	// Sync `modal`/`open` into the FloatingPortal context (it decides whether to render its guards).
	useLayoutEffect(
		() => {
			if (disabled || !portalContext) {
				return undefined;
			}
			portalContext.setFocusManagerState({
				modal,
				closeOnFocusOut,
				open,
				onOpenChange: store.setOpen,
				domReference,
			} as any);
			return () => {
				portalContext.setFocusManagerState(null);
			};
		},
		[disabled, portalContext, modal, open, store, closeOnFocusOut, domReference],
		subSlot(slot, 'e:portalsync'),
	);

	// Keep the floating element tabIndex in sync.
	useLayoutEffect(
		() => {
			if (disabled || !floatingFocusElement) {
				return undefined;
			}
			handleTabIndex(floatingFocusElement);
			return () => {
				queueMicrotask(clearDisconnectedPreviouslyFocusedElements);
			};
		},
		[disabled, floatingFocusElement],
		subSlot(slot, 'e:tabindex'),
	);

	const shouldRenderGuards =
		!disabled && (modal ? !isUntrappedTypeableCombobox : true) && (isInsidePortal || modal);

	return [
		shouldRenderGuards
			? createElement(FocusGuard, {
					'data-type': 'inside',
					ref: mergedBeforeGuardRef,
					onFocus(event: any) {
						if (modal) {
							const els = getTabbableContent();
							enqueueFocus(els[els.length - 1]);
						} else if (portalContext?.portalNode) {
							preventReturnFocusRef.current = false;
							if (isOutsideEvent(event, portalContext.portalNode)) {
								const nextTabbable = getNextTabbable(domReference);
								nextTabbable?.focus();
							} else {
								resolveRef(previousFocusableElement ?? portalContext.beforeOutsideRef)?.focus();
							}
						}
					},
				})
			: null,
		children,
		shouldRenderGuards
			? createElement(FocusGuard, {
					'data-type': 'inside',
					ref: mergedAfterGuardRef,
					onFocus(event: any) {
						if (modal) {
							enqueueFocus(getTabbableContent()[0]);
						} else if (portalContext?.portalNode) {
							if (closeOnFocusOut) {
								preventReturnFocusRef.current = true;
							}
							if (isOutsideEvent(event, portalContext.portalNode)) {
								const prevTabbable = getPreviousTabbable(domReference);
								prevTabbable?.focus();
							} else {
								resolveRef(nextFocusableElement ?? portalContext.afterOutsideRef)?.focus();
							}
						}
					},
				})
			: null,
	];
}
