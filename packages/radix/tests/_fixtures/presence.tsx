import { createElement, useState } from 'octane';
import { Presence } from '@octanejs/radix';

// Presence with a DESCRIPTOR child (createElement) exercises the real mount/unmount path:
// the child renders while present, and unmounts once `present` is false and no CSS
// animation is running (jsdom → immediate).
export function PresenceApp() {
	const [show, setShow] = useState(true);
	return createElement(
		'div',
		{},
		createElement(
			'button',
			{ 'data-testid': 'toggle', onClick: () => setShow((s: boolean) => !s) },
			'toggle',
		),
		createElement(
			Presence,
			{ present: show },
			createElement('span', { 'data-testid': 'box' }, 'hi'),
		),
	);
}
