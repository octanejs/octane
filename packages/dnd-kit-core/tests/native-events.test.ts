/**
 * Octane has no synthetic event layer, so sensor activators receive the
 * browser event itself rather than a React SyntheticEvent with `nativeEvent`.
 * The capture marker dnd kit writes on that event still lets only the
 * innermost draggable start a drag.
 */
import { afterEach, expect, it } from 'vitest';
import { createRoot, flushSync } from 'octane';
import { NestedDraggables, activations } from './_fixtures/native-events.tsrx';

afterEach(() => {
	document.body.replaceChildren();
	activations.length = 0;
});

// @parity-case ordinary:dnd-kit-core-native-activator-events
it('passes native events to activators and lets the innermost draggable claim them', () => {
	const container = document.body.appendChild(document.createElement('div'));
	const root = createRoot(container);
	flushSync(() => root.render(NestedDraggables));
	const press = new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, button: 0 });
	flushSync(() => {
		container.querySelector('#inner')!.dispatchEvent(press);
	});
	expect(activations).toEqual(['PointerEvent:false']);
	expect(container.querySelector('#started')!.textContent).toBe('inner');
	expect((press as PointerEvent & { dndKit?: unknown }).dndKit).toBeDefined();
	flushSync(() => {
		document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
	});
	root.unmount();
});
