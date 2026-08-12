import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render } from '@octanejs/testing-library';
import { Counter } from './_fixtures/counter.tsrx';

const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;

beforeAll(() => {
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(cleanup);
afterAll(() => {
	globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

function ReactCounter() {
	const [count, setCount] = useState(0);
	return createElement(
		'button',
		{ onClick: () => setCount((value) => value + 1) },
		`Count: ${count}`,
	);
}

describe('differential: @octanejs/testing-library vs a raw React root', () => {
	// @parity-case differential:testing-library-render-click
	it('render and native click commit the same counter DOM sequence', async () => {
		const reactContainer = document.body.appendChild(document.createElement('div'));
		const reactRoot = createRoot(reactContainer);
		await act(async () => reactRoot.render(createElement(ReactCounter)));

		const octaneResult = render(Counter);
		const reactButton = reactContainer.querySelector('button')!;
		const octaneButton = octaneResult.container.querySelector('button')!;
		expect(octaneButton.outerHTML).toBe(reactButton.outerHTML);

		await act(async () => reactButton.click());
		octaneButton.click();
		expect(octaneButton.outerHTML).toBe(reactButton.outerHTML);

		await act(async () => reactRoot.unmount());
		reactContainer.remove();
	});
});
