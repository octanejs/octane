import { useRef } from 'octane';
import { useOverlay } from '../../src/overlays/useOverlay';
import { usePreventScroll } from '../../src/overlays/usePreventScroll';
import { Overlay } from '../../src/overlays/Overlay';
import { DismissButton } from '../../src/overlays/DismissButton';

// An open, dismissable overlay wired to onClose. The overlayProps carry the Escape
// keydown handler and focus-within props; useOverlay also registers document-level
// interact-outside listeners against the overlay ref.
export function OverlayDismissHarness(props: { onClose: () => void }) {
	const ref = useRef(null);
	const { overlayProps } = useOverlay(
		{ isOpen: true, onClose: props.onClose, isDismissable: true },
		ref as any,
	);
	return (
		<div>
			<button data-testid="outside">outside</button>
			<div data-testid="overlay" ref={ref as any} {...(overlayProps as any)}>
				overlay content
			</div>
		</div>
	);
}

// usePreventScroll locks document scrolling on mount and restores it on unmount.
export function PreventScrollHarness(props: { isDisabled?: boolean }) {
	usePreventScroll({ isDisabled: props.isDisabled });
	return <div data-testid="ps">scroll locked</div>;
}

// Overlay renders its children into the provided portal container.
export function OverlayPortalHarness(props: { container: Element }) {
	return (
		<Overlay portalContainer={props.container} disableFocusManagement>
			<div data-testid="portaled">portaled content</div>
		</Overlay>
	);
}

// DismissButton renders a visually hidden button that calls onDismiss when clicked.
export function DismissButtonHarness(props: { onDismiss: () => void }) {
	return <DismissButton onDismiss={props.onDismiss} />;
}
