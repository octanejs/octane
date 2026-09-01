import { createRoot, flushSync } from 'octane';
import { EventWorkPortal } from './EventWorkPortal.tsrx';

export function runPortalLifecycle(cycles: number) {
	const result = {
		portalCycles: cycles,
		portalCaptures: 0,
		portalClicks: 0,
		portalBubbles: 0,
		portalRefsMounted: 0,
		portalRefsCleared: 0,
		portalDetachedClicks: 0,
		portalNodesAfterUnmount: 0,
	};
	for (let cycle = 0; cycle < cycles; cycle++) {
		const owners = Array.from({ length: 2 }, (_, index) => {
			const container = document.createElement('div');
			document.body.appendChild(container);
			return { container, root: createRoot(container), id: cycle * 2 + index };
		});
		try {
			const buttons = owners.map(({ root, id }) => {
				flushSync(() =>
					root.render(EventWorkPortal, {
						target: document.body,
						id,
						onCapture: () => result.portalCaptures++,
						onClick: () => result.portalClicks++,
						onBubble: () => result.portalBubbles++,
						onRef: (node: HTMLButtonElement | null) => {
							if (node === null) result.portalRefsCleared++;
							else result.portalRefsMounted++;
						},
					}),
				);
				const button = document.querySelector<HTMLButtonElement>(
					`[data-event-work-portal="${id}"]`,
				);
				if (button?.parentNode !== document.body) throw new Error('Portal did not mount into body');
				button.click();
				return button;
			});
			for (let index = 0; index < owners.length; index++) {
				owners[index].root.unmount();
				const before = result.portalClicks;
				buttons[index].click();
				result.portalDetachedClicks += result.portalClicks - before;
				if (buttons[index].isConnected) throw new Error('Unmounted portal is still connected');
				// A shared target stays live until its last owner unmounts.
				if (index === 0) buttons[1].click();
			}
		} finally {
			for (const { root, container } of owners) {
				root.unmount();
				container.remove();
			}
		}
		result.portalNodesAfterUnmount += document.querySelectorAll('[data-event-work-portal]').length;
	}
	return result;
}

(
	globalThis as typeof globalThis & { __eventWorkPortalLifecycle: typeof runPortalLifecycle }
).__eventWorkPortalLifecycle = runPortalLifecycle;
