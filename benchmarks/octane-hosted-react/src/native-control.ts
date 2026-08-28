import { createElement, createRoot, flushSync, useLayoutEffect, useState } from 'octane';

const STATE = Symbol('counter');
const EFFECT = Symbol('lifetime');

/** Deliberately plain public API: the baseline does not depend on the candidate compiler. */
export function runNativeControl() {
	let setups = 0;
	let cleanups = 0;
	function Counter(props: { label: string }) {
		const [value, setValue] = useState(0, STATE);
		useLayoutEffect(
			() => {
				setups++;
				return () => {
					cleanups++;
				};
			},
			[],
			EFFECT,
		);
		return createElement(
			'button',
			{ onClick: () => setValue((previous) => previous + 1) },
			`${props.label}:${value}`,
		);
	}
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	root.render(Counter, { label: 'before' });
	const button = container.querySelector('button')!;
	if (String(button.textContent) !== 'before:0') throw new Error('native mount output');
	flushSync(() => button.click());
	if (String(button.textContent) !== 'before:1') throw new Error('native local state update');
	flushSync(() => root.render(Counter, { label: 'after' }));
	if (container.querySelector('button') !== button || button.textContent !== 'after:1') {
		throw new Error('native parent update lost DOM or state');
	}
	root.unmount();
	if (container.childNodes.length !== 0 || setups !== 1 || cleanups !== 1) {
		throw new Error('native unmount cleanup');
	}
	container.remove();
	return { mount: 'before:0', local: 'before:1', update: 'after:1', setups, cleanups };
}
