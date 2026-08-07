import { initializeHydrationEventCapture } from 'octane';

export function run(container: HTMLElement) {
	const ownerDocument = container.ownerDocument;
	container.innerHTML =
		'<div data-octane-hydrate-id="minimal" data-octane-hydrate-when="interaction"><button>Activate</button></div>';
	let bubbled = false;
	const onBubble = () => {
		bubbled = true;
	};
	ownerDocument.addEventListener('click', onBubble);
	initializeHydrationEventCapture(ownerDocument);
	const event = new ownerDocument.defaultView!.MouseEvent('click', {
		bubbles: true,
		cancelable: true,
	});
	container.querySelector('button')!.dispatchEvent(event);
	ownerDocument.removeEventListener('click', onBubble);
	return { prevented: event.defaultPrevented, bubbled };
}
