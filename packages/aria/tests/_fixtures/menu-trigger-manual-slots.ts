// octane-no-slot
// A plain TypeScript consumer supplies distinct hook slots without compiler rewriting.
import { createElement, useRef } from 'octane';
import { useMenuTrigger } from '../../src/index';
import { useMenuTriggerState } from '../../src/stately/index';

export function TwoMenuTriggers() {
	const firstState = useMenuTriggerState({}, Symbol.for('menu-trigger-test:first-state'));
	const secondState = useMenuTriggerState({}, Symbol.for('menu-trigger-test:second-state'));
	const firstRef = useRef<HTMLButtonElement | null>(
		null,
		Symbol.for('menu-trigger-test:first-ref'),
	);
	const secondRef = useRef<HTMLButtonElement | null>(
		null,
		Symbol.for('menu-trigger-test:second-ref'),
	);
	const first = useMenuTrigger({}, firstState, firstRef, Symbol.for('menu-trigger-test:first'));
	const second = useMenuTrigger({}, secondState, secondRef, Symbol.for('menu-trigger-test:second'));

	return createElement('div', {
		children: [
			createElement('button', {
				key: 'first-trigger',
				...first.menuTriggerProps,
				ref: firstRef,
				children: 'First',
			}),
			createElement('div', { key: 'first-menu', ...first.menuProps, role: 'menu' }),
			createElement('button', {
				key: 'second-trigger',
				...second.menuTriggerProps,
				ref: secondRef,
				children: 'Second',
			}),
			createElement('div', { key: 'second-menu', ...second.menuProps, role: 'menu' }),
		],
	});
}
