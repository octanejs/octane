// Ported from @floating-ui/react FloatingPortal (+ FocusGuard, useFloatingPortalNode,
// PortalContext). `.ts` components via createElement; React forwardRef → props.ref;
// ReactDOM.createPortal(children, node) → octane createPortal (which renders a value
// anywhere). Focus guards only render when a non-modal FloatingFocusManager registers
// its state, so a standalone portal just renders its children into the portal node.
import { isNode } from '@floating-ui/utils/dom';
import {
	createContext,
	createElement,
	createPortal,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

import { S, splitSlot, subSlot } from './internal';
import { useId } from './useId';
import {
	createAttribute,
	disableFocusInside,
	enableFocusInside,
	getNextTabbable,
	getPreviousTabbable,
	isOutsideEvent,
	isSafari,
	useModernLayoutEffect,
} from './utils';

const HIDDEN_STYLES: any = {
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

export function FocusGuard(props: any): any {
	const [role, setRole] = useState<any>(undefined, S('FocusGuard:role'));
	useModernLayoutEffect(
		() => {
			if (isSafari()) {
				setRole('button');
			}
		},
		[],
		S('FocusGuard:eff'),
	);
	return createElement('span', {
		...props,
		tabIndex: 0,
		role,
		'aria-hidden': role ? undefined : true,
		[createAttribute('focus-guard')]: '',
		style: HIDDEN_STYLES,
	});
}

const HIDDEN_OWNER_STYLES: any = {
	clipPath: 'inset(50%)',
	position: 'fixed',
	top: 0,
	left: 0,
};
export const PortalContext = createContext<any>(null);
const attr = createAttribute('portal');

export function useFloatingPortalNode(...args: any[]): any {
	// Exported hook → may be called directly by consumers (compiler injects the
	// slot) or by FloatingPortal (passes an S() slot); fall back to S() otherwise.
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFloatingPortalNode');
	const props = (user[0] as any) ?? {};
	const id = props.id;
	const root = props.root;

	const uniqueId = useId(subSlot(slot, 'id'));
	const portalContext = usePortalContext();
	const [portalNode, setPortalNode] = useState<any>(null, subSlot(slot, 'node'));
	const portalNodeRef = useRef<any>(null, subSlot(slot, 'noderef'));

	useModernLayoutEffect(
		() => {
			return () => {
				portalNode?.remove();
				queueMicrotask(() => {
					portalNodeRef.current = null;
				});
			};
		},
		[portalNode],
		subSlot(slot, 'e:cleanup'),
	);

	useModernLayoutEffect(
		() => {
			if (!uniqueId) return;
			if (portalNodeRef.current) return;
			const existingIdRoot = id ? document.getElementById(id) : null;
			if (!existingIdRoot) return;
			const subRoot = document.createElement('div');
			subRoot.id = uniqueId;
			subRoot.setAttribute(attr, '');
			existingIdRoot.appendChild(subRoot);
			portalNodeRef.current = subRoot;
			setPortalNode(subRoot);
		},
		[id, uniqueId],
		subSlot(slot, 'e:id'),
	);

	useModernLayoutEffect(
		() => {
			if (root === null) return;
			if (!uniqueId) return;
			if (portalNodeRef.current) return;
			let container = root || portalContext?.portalNode;
			if (container && !isNode(container)) container = container.current;
			container = container || document.body;
			let idWrapper = null;
			if (id) {
				idWrapper = document.createElement('div');
				idWrapper.id = id;
				container.appendChild(idWrapper);
			}
			const subRoot = document.createElement('div');
			subRoot.id = uniqueId;
			subRoot.setAttribute(attr, '');
			container = idWrapper || container;
			container.appendChild(subRoot);
			portalNodeRef.current = subRoot;
			setPortalNode(subRoot);
		},
		[id, root, uniqueId, portalContext],
		subSlot(slot, 'e:root'),
	);

	return portalNode;
}

export function FloatingPortal(props: any): any {
	const children = props.children;
	const id = props.id;
	const root = props.root;
	const preserveTabOrder = props.preserveTabOrder ?? true;

	const portalNode = useFloatingPortalNode([{ id, root }, S('FloatingPortal:node')]);
	const [focusManagerState, setFocusManagerState] = useState<any>(null, S('FloatingPortal:fms'));
	const beforeOutsideRef = useRef<any>(null, S('FloatingPortal:bo'));
	const afterOutsideRef = useRef<any>(null, S('FloatingPortal:ao'));
	const beforeInsideRef = useRef<any>(null, S('FloatingPortal:bi'));
	const afterInsideRef = useRef<any>(null, S('FloatingPortal:ai'));
	const modal = focusManagerState?.modal;
	const open = focusManagerState?.open;
	const shouldRenderGuards =
		!!focusManagerState &&
		!focusManagerState.modal &&
		focusManagerState.open &&
		preserveTabOrder &&
		!!(root || portalNode);

	useEffect(
		() => {
			if (!portalNode || !preserveTabOrder || modal) {
				return;
			}
			function onFocus(event: any) {
				if (portalNode && isOutsideEvent(event)) {
					const focusing = event.type === 'focusin';
					const manageFocus = focusing ? enableFocusInside : disableFocusInside;
					manageFocus(portalNode);
				}
			}
			portalNode.addEventListener('focusin', onFocus, true);
			portalNode.addEventListener('focusout', onFocus, true);
			return () => {
				portalNode.removeEventListener('focusin', onFocus, true);
				portalNode.removeEventListener('focusout', onFocus, true);
			};
		},
		[portalNode, preserveTabOrder, modal],
		S('FloatingPortal:e:tab'),
	);

	useEffect(
		() => {
			if (!portalNode) return;
			if (open) return;
			enableFocusInside(portalNode);
		},
		[open, portalNode],
		S('FloatingPortal:e:enable'),
	);

	const value = useMemo(
		() => ({
			preserveTabOrder,
			beforeOutsideRef,
			afterOutsideRef,
			beforeInsideRef,
			afterInsideRef,
			portalNode,
			setFocusManagerState,
		}),
		[preserveTabOrder, portalNode],
		S('FloatingPortal:value'),
	);

	return createElement(PortalContext.Provider, {
		value,
		children: [
			shouldRenderGuards &&
				portalNode &&
				createElement(FocusGuard, {
					'data-type': 'outside',
					ref: beforeOutsideRef,
					onFocus: (event: any) => {
						if (isOutsideEvent(event, portalNode)) {
							beforeInsideRef.current?.focus();
						} else {
							const domReference = focusManagerState ? focusManagerState.domReference : null;
							getPreviousTabbable(domReference)?.focus();
						}
					},
				}),
			shouldRenderGuards &&
				portalNode &&
				createElement('span', { 'aria-owns': portalNode.id, style: HIDDEN_OWNER_STYLES }),
			portalNode && createPortal(children, portalNode),
			shouldRenderGuards &&
				portalNode &&
				createElement(FocusGuard, {
					'data-type': 'outside',
					ref: afterOutsideRef,
					onFocus: (event: any) => {
						if (isOutsideEvent(event, portalNode)) {
							afterInsideRef.current?.focus();
						} else {
							const domReference = focusManagerState ? focusManagerState.domReference : null;
							getNextTabbable(domReference)?.focus();
							focusManagerState?.closeOnFocusOut &&
								focusManagerState?.onOpenChange(false, event, 'focus-out');
						}
					},
				}),
		],
	});
}

export const usePortalContext = () => useContext(PortalContext);
