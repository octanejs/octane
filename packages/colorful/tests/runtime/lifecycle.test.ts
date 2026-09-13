import { createRoot, flushSync } from 'octane';
import { expect, it } from 'vitest';
import { flushEffects } from '../../../octane/tests/_helpers';
import { PickerList } from './_fixtures/PickerList.tsrx';

// @parity-case adapted:react-colorful-lifecycle
it('preserves picker identity and refs through controlled updates and keyed reordering', () => {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	const refs = new Map<string, HTMLDivElement | null>();
	const first = {
		id: 'first',
		color: '#ff0000',
		ref: (node: HTMLDivElement | null) => refs.set('first', node),
	};
	const second = {
		id: 'second',
		color: '#00ff00',
		ref: (node: HTMLDivElement | null) => refs.set('second', node),
	};
	const render = (pickers: (typeof first)[]) => {
		root.render(PickerList, { pickers });
		flushSync(() => {});
		flushEffects();
		flushSync(() => {});
	};
	try {
		render([first, second]);
		const firstNode = container.querySelector('[data-testid="first"]');
		const secondNode = container.querySelector('[data-testid="second"]');
		expect(refs.get('first')).toBe(firstNode);
		expect(refs.get('second')).toBe(secondNode);
		const hue = firstNode!.querySelector<HTMLElement>('[aria-label="Hue"]')!;
		hue.focus();
		render([{ ...first, color: '#0000ff' }, second]);
		expect(document.activeElement).toBe(hue);
		expect(hue.getAttribute('aria-valuenow')).toBe('240');
		render([second, first]);
		expect([...container.querySelectorAll('[data-testid]')]).toEqual([secondNode, firstNode]);
		expect(refs.get('first')).toBe(firstNode);
		expect(refs.get('second')).toBe(secondNode);
		render([second]);
		expect(refs.get('first')).toBeNull();
		expect(container.contains(firstNode)).toBe(false);
		expect(refs.get('second')).toBe(secondNode);
	} finally {
		root.unmount();
		container.remove();
	}
	expect(refs.get('second')).toBeNull();
});
