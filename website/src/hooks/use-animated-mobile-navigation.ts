// Shared state and close sequencing for the responsive sidebar disclosures.
// Section links wait for the panel's actual CSS animations rather than mirroring
// their duration in JavaScript, so each host can change its transition safely.
import { useRef, useState } from 'octane';

function waitForPanelToClose(panel: HTMLElement): Promise<void> {
	return new Promise((resolve) => {
		// State commits after the event handler returns. Read the animation list on
		// the next frame, once removing `is-open` has created the closing transitions.
		requestAnimationFrame(() => {
			const animations = panel.getAnimations();
			if (animations.length === 0) {
				resolve();
				return;
			}
			// Cancellation rejects Animation.finished. A canceled close no longer has
			// an animation to wait for, so either outcome releases section navigation.
			void Promise.allSettled(animations.map((animation) => animation.finished)).then(() =>
				resolve(),
			);
		});
	});
}

export function useAnimatedMobileNavigation() {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const mobileMenuPanel = useRef<HTMLDivElement | null>(null);

	const toggleMobileNavigation = () => setMobileMenuOpen((open) => !open);
	const closeMobileNavigation = () => {
		if (!mobileMenuOpen) return;
		const panel = mobileMenuPanel.current;
		setMobileMenuOpen(false);
		if (!panel) return;
		return waitForPanelToClose(panel);
	};

	return {
		mobileMenuOpen,
		mobileMenuPanel,
		toggleMobileNavigation,
		closeMobileNavigation,
	};
}
