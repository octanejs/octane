import { afterEach, describe, expect, it } from 'vitest';

import { pointer, type } from './userEvent';

describe('user interactions', () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it('dispatches native pointer, context-menu, and keyboard events', async () => {
		const pointerEvents: PointerEvent[] = [];
		const contextMenuEvents: MouseEvent[] = [];
		const element = document.createElement('button');
		document.body.append(element);
		element.focus();

		document.addEventListener('pointerdown', (event) => pointerEvents.push(event));
		document.addEventListener('pointermove', (event) => pointerEvents.push(event));
		document.addEventListener('pointerup', (event) => pointerEvents.push(event));
		document.addEventListener('contextmenu', (event) => contextMenuEvents.push(event));
		const keyboardEvents: KeyboardEvent[] = [];
		element.addEventListener('keydown', (event) => keyboardEvents.push(event));

		await pointer([
			{ keys: '[MouseLeft>]', coords: { clientX: 10, clientY: 20 } },
			{ coords: { clientX: 14, clientY: 27 } },
			{ keys: '[/MouseLeft]' },
			{ keys: '[MouseRight>]', coords: { clientX: 30, clientY: 40 } },
			{ keys: '[/MouseRight]' },
		]);
		await type(element, '{ArrowRight}{Home}');

		expect(pointerEvents.map(({ type }) => type)).toEqual([
			'pointerdown',
			'pointermove',
			'pointerup',
			'pointerdown',
			'pointerup',
		]);
		expect(pointerEvents.map(({ button, buttons }) => [button, buttons])).toEqual([
			[0, 1],
			[-1, 1],
			[0, 0],
			[2, 2],
			[2, 0],
		]);
		expect(pointerEvents[1]).toMatchObject({
			bubbles: true,
			clientX: 14,
			clientY: 27,
			movementX: 4,
			movementY: 7,
			pointerId: 1,
			pointerType: 'mouse',
		});
		expect(contextMenuEvents).toHaveLength(1);
		expect(contextMenuEvents[0]).toMatchObject({
			bubbles: true,
			button: 2,
			clientX: 30,
			clientY: 40,
		});
		expect(keyboardEvents.map(({ key }) => key)).toEqual(['ArrowRight', 'Home']);
		expect(keyboardEvents.every(({ bubbles }) => bubbles)).toBe(true);
	});
});
