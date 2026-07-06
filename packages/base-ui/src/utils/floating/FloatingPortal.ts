// Ported from .base-ui/packages/react/src/floating-ui-react/components/FloatingPortal.tsx (v1.6.0),
// octane-adapted: forwardRef → ref-as-prop; hooks thread slots; `ReactDOM.createPortal` → octane
// `createPortal`; native events. Renders a styleable portal-node div (`<div id data-base-ui-portal>`)
// into the container + portals children into it; adds tab-order focus guards for non-modal popups.
import {
	createContext,
	createElement,
	createPortal,
	useContext,
	useState,
	useRef,
	useMemo,
	useEffect,
	useLayoutEffect,
	useId,
} from 'octane';
import { isNode } from '@floating-ui/utils/dom';

import { S, subSlot } from '../../internal';
import { useStableCallback } from '../useStableCallback';
import { addEventListener } from '../addEventListener';
import { mergeCleanups } from '../mergeCleanups';
import { EMPTY_OBJECT } from '../empty';
import { useRenderElement } from '../useRenderElement';
import { createAttribute } from './createAttribute';
import { FocusGuard } from './FocusGuard';
import {
	enableFocusInside,
	disableFocusInside,
	getPreviousTabbable,
	getNextTabbable,
	isOutsideEvent,
} from './tabbable';
import { createChangeEventDetails, REASONS } from '../createChangeEventDetails';

const ownerVisuallyHidden = {
	clipPath: 'inset(50%)',
	position: 'fixed',
	top: 0,
	left: 0,
};

type FocusManagerState = null | {
	modal: boolean;
	open: boolean;
	onOpenChange: (open: boolean, data?: { reason?: string; event?: Event }) => void;
	domReference: Element | null;
	closeOnFocusOut: boolean;
};

interface PortalContextValue {
	portalNode: HTMLElement | null;
	setFocusManagerState: (v: FocusManagerState) => void;
	beforeInsideRef: { current: HTMLSpanElement | null };
	afterInsideRef: { current: HTMLSpanElement | null };
	beforeOutsideRef: { current: HTMLSpanElement | null };
	afterOutsideRef: { current: HTMLSpanElement | null };
}

const PortalContext = createContext<PortalContextValue | null>(null);

export const usePortalContext = () => useContext(PortalContext);

const attr = createAttribute('portal');

export function useFloatingPortalNode(userProps: any, slot: symbol | undefined): any {
	const { ref, container: containerProp, componentProps = EMPTY_OBJECT, elementProps } = userProps;

	// Raw `useId` (no `base-ui-` prefix), matching Base UI's `@base-ui/utils/useId`.
	const uniqueId = useId(subSlot(slot, 'id'));
	const portalContext = usePortalContext();
	const parentPortalNode = portalContext?.portalNode;

	const [containerElement, setContainerElement] = useState<Element | null>(
		null,
		subSlot(slot, 'cel'),
	);
	const [portalNode, setPortalNode] = useState<HTMLElement | null>(null, subSlot(slot, 'pn'));
	const setPortalNodeRef = useStableCallback(
		(node: HTMLElement | null) => {
			if (node !== null) {
				setPortalNode(node);
			}
		},
		subSlot(slot, 'pnr'),
	);

	const containerRef = useRef<Element | null>(null, subSlot(slot, 'cref'));

	useLayoutEffect(
		() => {
			if (containerProp === null) {
				if (containerRef.current) {
					containerRef.current = null;
					setPortalNode(null);
					setContainerElement(null);
				}
				return;
			}
			if (uniqueId == null) {
				return;
			}
			const resolvedContainer =
				(containerProp && (isNode(containerProp) ? containerProp : containerProp.current)) ??
				parentPortalNode ??
				document.body;
			if (resolvedContainer == null) {
				if (containerRef.current) {
					containerRef.current = null;
					setPortalNode(null);
					setContainerElement(null);
				}
				return;
			}
			if (containerRef.current !== resolvedContainer) {
				containerRef.current = resolvedContainer;
				setPortalNode(null);
				setContainerElement(resolvedContainer);
			}
		},
		[containerProp, parentPortalNode, uniqueId],
		subSlot(slot, 'e:container'),
	);

	const portalElement = useRenderElement(
		'div',
		componentProps,
		{
			ref: [ref, setPortalNodeRef],
			props: [{ id: uniqueId, [attr]: '' }, elementProps],
		},
		subSlot(slot, 're'),
	);

	const portalSubtree =
		containerElement && portalElement ? createPortal(portalElement, containerElement) : null;

	return { portalNode, portalSubtree };
}

export function FloatingPortal(componentProps: any): any {
	const slot = S('FloatingPortal');
	const { render, className, style, children, container, renderGuards, ref, ...elementProps } =
		componentProps;

	const { portalNode, portalSubtree } = useFloatingPortalNode(
		{ container, ref, componentProps: { render, className, style }, elementProps },
		subSlot(slot, 'node'),
	);

	const beforeOutsideRef = useRef<HTMLSpanElement | null>(null, subSlot(slot, 'bo'));
	const afterOutsideRef = useRef<HTMLSpanElement | null>(null, subSlot(slot, 'ao'));
	const beforeInsideRef = useRef<HTMLSpanElement | null>(null, subSlot(slot, 'bi'));
	const afterInsideRef = useRef<HTMLSpanElement | null>(null, subSlot(slot, 'ai'));

	const [focusManagerState, setFocusManagerState] = useState<FocusManagerState>(
		null,
		subSlot(slot, 'fms'),
	);
	const focusInsideDisabledRef = useRef(false, subSlot(slot, 'fid'));

	const modal = focusManagerState?.modal;
	const open = focusManagerState?.open;

	const shouldRenderGuards =
		typeof renderGuards === 'boolean'
			? renderGuards
			: !!focusManagerState && !focusManagerState.modal && focusManagerState.open && !!portalNode;

	useEffect(
		() => {
			if (!portalNode || modal) {
				return undefined;
			}
			function onFocus(event: FocusEvent) {
				if (portalNode && event.relatedTarget && isOutsideEvent(event)) {
					if (event.type === 'focusin') {
						if (focusInsideDisabledRef.current) {
							enableFocusInside(portalNode);
							focusInsideDisabledRef.current = false;
						}
					} else {
						disableFocusInside(portalNode);
						focusInsideDisabledRef.current = true;
					}
				}
			}
			return mergeCleanups(
				addEventListener(portalNode, 'focusin', onFocus as EventListener, true),
				addEventListener(portalNode, 'focusout', onFocus as EventListener, true),
			);
		},
		[portalNode, modal],
		subSlot(slot, 'e:tab'),
	);

	useLayoutEffect(
		() => {
			if (!portalNode || open !== true || !focusInsideDisabledRef.current) {
				return;
			}
			enableFocusInside(portalNode);
			focusInsideDisabledRef.current = false;
		},
		[open, portalNode],
		subSlot(slot, 'e:enable'),
	);

	const portalContextValue = useMemo(
		() => ({
			beforeOutsideRef,
			afterOutsideRef,
			beforeInsideRef,
			afterInsideRef,
			portalNode,
			setFocusManagerState,
		}),
		[portalNode],
		subSlot(slot, 'ctx'),
	);

	return [
		portalSubtree,
		createElement(PortalContext.Provider, {
			value: portalContextValue,
			children: [
				shouldRenderGuards && portalNode
					? createElement(FocusGuard, {
							'data-type': 'outside',
							ref: beforeOutsideRef,
							onFocus(event: any) {
								if (isOutsideEvent(event, portalNode)) {
									beforeInsideRef.current?.focus();
								} else {
									const domReference = focusManagerState ? focusManagerState.domReference : null;
									getPreviousTabbable(domReference)?.focus();
								}
							},
						})
					: null,
				shouldRenderGuards && portalNode
					? createElement('span', { 'aria-owns': portalNode.id, style: ownerVisuallyHidden })
					: null,
				portalNode ? createPortal(children, portalNode) : null,
				shouldRenderGuards && portalNode
					? createElement(FocusGuard, {
							'data-type': 'outside',
							ref: afterOutsideRef,
							onFocus(event: any) {
								if (isOutsideEvent(event, portalNode)) {
									afterInsideRef.current?.focus();
								} else {
									const domReference = focusManagerState ? focusManagerState.domReference : null;
									getNextTabbable(domReference)?.focus();
									if (focusManagerState?.closeOnFocusOut) {
										focusManagerState?.onOpenChange(
											false,
											createChangeEventDetails(REASONS.focusOut, event) as any,
										);
									}
								}
							},
						})
					: null,
			],
		}),
	];
}
