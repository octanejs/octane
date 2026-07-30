import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useBoolean, useCounter, useMap, useStep, useToggle } from 'usehooks-ts';
import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { StateProbe } from './_fixtures/hooks.tsrx';

function ReactStateProbe() {
	const first = useBoolean();
	const second = useBoolean(true);
	const counter = useCounter(2);
	const [toggle, flip] = useToggle();
	const [map, actions] = useMap([['a', 1]]);
	const [step, stepActions] = useStep(2);
	return createElement(
		'div',
		null,
		createElement(
			'span',
			{ id: 'state' },
			`${first.value}/${second.value}/${counter.count}/${toggle}/${map.get('a') ?? '-'}/${step}`,
		),
		createElement('button', { id: 'first', onClick: first.toggle }),
		createElement('button', { id: 'second', onClick: second.toggle }),
		createElement('button', { id: 'increment', onClick: counter.increment }),
		createElement('button', { id: 'toggle', onClick: flip }),
		createElement('button', { id: 'map', onClick: () => actions.set('a', 2) }),
		createElement('button', { id: 'next', onClick: stepActions.goToNextStep }),
	);
}

afterEach(() => document.body.replaceChildren());

describe('React 3.1.1 characterization oracle', () => {
	it('produces the same state sequence at the supported public boundary', async () => {
		const octane = mount(StateProbe);
		const reactContainer = document.createElement('div');
		document.body.appendChild(reactContainer);
		const reactRoot = createRoot(reactContainer);
		await act(() => reactRoot.render(createElement(ReactStateProbe)));

		const snapshots: string[] = [];
		for (const selector of ['#first', '#second', '#increment', '#toggle', '#map', '#next']) {
			octane.click(selector);
			await act(() => {
				reactContainer.querySelector<HTMLButtonElement>(selector)?.click();
			});
			const octaneText = octane.find('#state').textContent;
			const reactText = reactContainer.querySelector('#state')?.textContent;
			expect(octaneText).toBe(reactText);
			snapshots.push(octaneText ?? '');
		}
		expect(snapshots.at(-1)).toBe('true/false/3/true/2/2');

		octane.unmount();
		await act(() => reactRoot.unmount());
	});
});
