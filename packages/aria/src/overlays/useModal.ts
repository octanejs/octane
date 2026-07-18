// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/overlays/useModal.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; `ReactDOM.createPortal` →
// octane's `createPortal(children, container)` (see aria memory octane-portal-as-value);
// the plain-`.ts` components use the S()/subSlot component-slot convention with a stable
// `{ value, children }` Provider descriptor shape; `useContext` is context-identity keyed so
// it needs no slot threading; `useModal` is a public hook with slot threading and keeps its
// explicit dependency array verbatim; React's ReactNode/JSX/AriaAttributes types → `any`
// (a minimal structural DOMAttributes alias replaces upstream's synthetic-handler prop bag).
import {
	createContext,
	createElement,
	createPortal,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'octane';
import { useIsSSR } from '../ssr/SSRProvider';
import { useUNSAFE_PortalContext } from './PortalProvider';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural prop bag (upstream drags React's synthetic handler
// and aria attribute types along).
type DOMAttributes = Record<string, any>;

export interface ModalProviderProps extends DOMAttributes {
	children: any;
}

interface ModalContext {
	parent: ModalContext | null;
	modalCount: number;
	addModal: () => void;
	removeModal: () => void;
}

const Context = createContext<ModalContext | null>(null);

/**
 * Each ModalProvider tracks how many modals are open in its subtree. On mount, the modals trigger
 * `addModal` to increment the count, and trigger `removeModal` on unmount to decrement it. This is
 * done recursively so that all parent providers are incremented and decremented. If the modal count
 * is greater than zero, we add `aria-hidden` to this provider to hide its subtree from screen
 * readers. This is done using context in order to account for things like portals, which can
 * cause the component tree and the DOM tree to differ significantly in structure.
 */
export function ModalProvider(props: ModalProviderProps): any {
	const slot = S('ModalProvider');
	let { children } = props;
	let parent = useContext(Context);
	let [modalCount, setModalCount] = useState(0, subSlot(slot, 'count'));
	let context = useMemo(
		() => ({
			parent,
			modalCount,
			addModal() {
				setModalCount((count) => count + 1);
				if (parent) {
					parent.addModal();
				}
			},
			removeModal() {
				setModalCount((count) => count - 1);
				if (parent) {
					parent.removeModal();
				}
			},
		}),
		[parent, modalCount],
		subSlot(slot, 'context'),
	);

	return createElement(Context.Provider, { value: context, children });
}

export interface ModalProviderAria {
	/** Props to be spread on the container element. */
	modalProviderProps: DOMAttributes;
}

/**
 * Used to determine if the tree should be aria-hidden based on how many
 * modals are open.
 */
export function useModalProvider(): ModalProviderAria {
	let context = useContext(Context);
	return {
		modalProviderProps: {
			'aria-hidden': context && context.modalCount > 0 ? true : undefined,
		},
	};
}

/**
 * Creates a root node that will be aria-hidden if there are other modals open.
 */
function OverlayContainerDOM(props: ModalProviderProps): any {
	let { modalProviderProps } = useModalProvider();
	return createElement('div', { 'data-overlay-container': true, ...props, ...modalProviderProps });
}

/**
 * An OverlayProvider acts as a container for the top-level application.
 * Any application that uses modal dialogs or other overlays should
 * be wrapped in a `<OverlayProvider>`. This is used to ensure that
 * the main content of the application is hidden from screen readers
 * if a modal or other overlay is opened. Only the top-most modal or
 * overlay should be accessible at once.
 */
export function OverlayProvider(props: ModalProviderProps): any {
	return createElement(ModalProvider, {
		children: createElement(OverlayContainerDOM, { ...props }),
	});
}

export interface OverlayContainerProps extends ModalProviderProps {
	/**
	 * The container element in which the overlay portal will be placed.
	 *
	 * @deprecated - Use a parent UNSAFE_PortalProvider to set your portal container instead.
	 * @default document.body
	 */
	portalContainer?: Element;
}

/**
 * A container for overlays like modals and popovers. Renders the overlay
 * into a Portal which is placed at the end of the document body.
 * Also ensures that the overlay is hidden from screen readers if a
 * nested modal is opened. Only the top-most modal or overlay should
 * be accessible at once.
 */
export function OverlayContainer(props: OverlayContainerProps): any {
	const slot = S('OverlayContainer');
	let isSSR = useIsSSR(subSlot(slot, 'ssr'));
	let { portalContainer = isSSR ? null : document.body, ...rest } = props;
	let { getContainer } = useUNSAFE_PortalContext();
	if (!props.portalContainer && getContainer) {
		portalContainer = getContainer();
	}

	useEffect(
		() => {
			if (portalContainer?.closest('[data-overlay-container]')) {
				throw new Error(
					'An OverlayContainer must not be inside another container. Please change the portalContainer prop.',
				);
			}
		},
		[portalContainer],
		subSlot(slot, 'nested'),
	);

	if (!portalContainer) {
		return null;
	}

	let contents = createElement(OverlayProvider, { ...rest });
	return createPortal(contents, portalContainer);
}

interface ModalAriaProps extends DOMAttributes {
	/** Data attribute marks the dom node as a modal for the aria-modal-polyfill. */
	'data-ismodal': boolean;
}

export interface AriaModalOptions {
	isDisabled?: boolean;
}

export interface ModalAria {
	/** Props for the modal content element. */
	modalProps: ModalAriaProps;
}

/**
 * Hides content outside the current `<OverlayContainer>` from screen readers
 * on mount and restores it on unmount. Typically used by modal dialogs and
 * other types of overlays to ensure that only the top-most modal is
 * accessible at once.
 */
export function useModal(options?: AriaModalOptions): ModalAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useModal(
	options: AriaModalOptions | undefined,
	slot: symbol | undefined,
): ModalAria;
export function useModal(...args: any[]): ModalAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useModal');
	const options = user[0] as AriaModalOptions | undefined;

	// Add aria-hidden to all parent providers on mount, and restore on unmount.
	let context = useContext(Context);
	if (!context) {
		throw new Error('Modal is not contained within a provider');
	}

	useEffect(
		() => {
			if (options?.isDisabled || !context || !context.parent) {
				return;
			}

			// The immediate context is from the provider containing this modal, so we only
			// want to trigger aria-hidden on its parents not on the modal provider itself.
			context.parent.addModal();
			return () => {
				if (context && context.parent) {
					context.parent.removeModal();
				}
			};
		},
		[context, context.parent, options?.isDisabled],
		subSlot(slot, 'modal'),
	);

	return {
		modalProps: {
			'data-ismodal': !options?.isDisabled,
		},
	};
}
