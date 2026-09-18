import { test } from 'vitest';
test('env', () => {
	console.log(
		'Node:',
		typeof Node,
		'matchMedia:',
		typeof window.matchMedia,
		'ResizeObserver:',
		typeof ResizeObserver,
		'MutationObserver:',
		typeof MutationObserver,
		'visualViewport:',
		typeof window.visualViewport,
		'getComputedStyle:',
		typeof getComputedStyle,
		'requestAnimationFrame:',
		typeof requestAnimationFrame,
		'HTMLDialog:',
		typeof HTMLDialogElement,
		'PointerEvent:',
		typeof PointerEvent,
		'clipboard:',
		typeof navigator.clipboard,
	);
});
