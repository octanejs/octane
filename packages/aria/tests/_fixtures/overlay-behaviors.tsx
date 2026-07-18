import { useRef, useState } from 'octane';
import { useModalOverlay } from '../../src/overlays/useModalOverlay';
import { usePopover } from '../../src/overlays/usePopover';
import {
	useModal,
	ModalProvider,
	OverlayProvider,
	OverlayContainer,
} from '../../src/overlays/useModal';
import { useOverlayTriggerState } from '../../src/stately/overlays/useOverlayTriggerState';

// A modal overlay driven by an OverlayTriggerState. When open, useModalOverlay hides
// content outside the modal ref (ariaHideOutside) and wires Escape / underlay dismiss to
// state.close (which forwards to onClose here). The underlay wraps the modal so an
// interact-outside on the underlay dismisses.
export function ModalOverlayHarness(props: { isOpen: boolean; onClose: () => void }) {
	const ref = useRef(null);
	const state = useOverlayTriggerState({
		isOpen: props.isOpen,
		onOpenChange: (open) => {
			if (!open) props.onClose();
		},
	});
	const { modalProps, underlayProps } = useModalOverlay({ isDismissable: true }, state, ref as any);
	return (
		<div>
			<div data-testid="outside">outside content</div>
			<div data-testid="underlay" {...(underlayProps as any)}>
				<div data-testid="modal" ref={ref as any} {...(modalProps as any)}>
					modal content
				</div>
			</div>
		</div>
	);
}

// A popover driven by an OverlayTriggerState. In the default (modal) path useOverlay is
// dismissable and useEffect calls ariaHideOutside to hide sibling content; in the isNonModal
// path outside content stays visible (keepVisible). Escape on the popover dismisses via the
// overlayProps keydown handler. `capture` exposes the returned aria object for wiring assertions.
export function PopoverHarness(props: {
	isOpen: boolean;
	onClose: () => void;
	isNonModal?: boolean;
	capture?: (aria: any) => void;
}) {
	const triggerRef = useRef(null);
	const popoverRef = useRef(null);
	const state = useOverlayTriggerState({
		isOpen: props.isOpen,
		onOpenChange: (open) => {
			if (!open) props.onClose();
		},
	});
	const aria = usePopover(
		{ triggerRef: triggerRef as any, popoverRef: popoverRef as any, isNonModal: props.isNonModal },
		state,
	);
	props.capture?.(aria);
	return (
		<div>
			<button data-testid="trigger" ref={triggerRef as any}>
				trigger
			</button>
			<div data-testid="outside">outside content</div>
			<div data-testid="popover" ref={popoverRef as any} {...(aria.popoverProps as any)}>
				<span data-testid="arrow" {...(aria.arrowProps as any)} />
				popover content
			</div>
		</div>
	);
}

// OverlayContainer portals its children (wrapped in an OverlayProvider) into the given container.
export function OverlayContainerHarness(props: { container: Element }) {
	return (
		<OverlayContainer portalContainer={props.container}>
			<div data-testid="overlay-child">overlay child</div>
		</OverlayContainer>
	);
}

// A modal that registers itself with the enclosing ModalProvider while enabled. When
// isDisabled flips, useModal's effect re-runs: enabling calls addModal on the parent provider,
// disabling runs its cleanup (removeModal). modalProps marks the element as a modal.
function ModalContent(props: { isDisabled: boolean }) {
	const { modalProps } = useModal({ isDisabled: props.isDisabled });
	return (
		<div data-testid="modal-content" {...(modalProps as any)}>
			modal
		</div>
	);
}

// An OverlayProvider whose container div is aria-hidden while a nested modal is active. The
// tree stays stable (the modal is always mounted); toggling isDisabled raises and lowers the
// outer provider's modal count via useModal's add/remove, which drives aria-hidden.
export function UseModalHarness() {
	const [disabled, setDisabled] = useState(true);
	return (
		<OverlayProvider data-testid="app">
			<button data-testid="toggle" onClick={() => setDisabled((d) => !d)}>
				toggle
			</button>
			<ModalProvider>
				<ModalContent isDisabled={disabled} />
			</ModalProvider>
		</OverlayProvider>
	);
}
