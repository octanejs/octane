/** @jsxImportSource octane */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { drainPassiveEffects, flushSync } from 'octane';
import { mount } from '../_helpers.js';
import { OctaneMiddle, OctaneOuter } from './nested.tsrx';
import { ReactOuter } from './nested.react.js';
import type { NestedProps } from './nested-types.js';

const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
const dispose: (() => void)[] = [];
const faults: unknown[] = [];
let consoleError: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
	environment.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
	environment.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});
beforeEach(() => {
	faults.length = 0;
	consoleError = vi.spyOn(console, 'error').mockImplementation((...args) => {
		faults.push(args);
	});
});
afterEach(async () => {
	try {
		await run(() => {
			for (const cleanup of dispose.splice(0)) cleanup();
		});
		expect(faults).toEqual([]);
	} finally {
		consoleError.mockRestore();
	}
});

async function run(action: () => void) {
	await React.act(async () => {
		action();
		flushSync(() => {});
		drainPassiveEffects();
	});
	flushSync(() => {});
	drainPassiveEffects();
}

function fixture(strict: boolean) {
	const signals: string[] = [];
	const props: NestedProps = {
		label: 'first',
		strict,
		bus: new EventTarget(),
		onSignal: (owner, label) => {
			signals.push(owner + ':' + label);
		},
		octaneRef: { current: null },
		reactRef: { current: null },
	};
	return {
		props,
		ping(expected: string[]) {
			props.bus.dispatchEvent(new Event('ping'));
			expect(signals.splice(0).sort()).toEqual([...expected].sort());
		},
	};
}

function click(container: Element, selector: string) {
	const button = container.querySelector<HTMLButtonElement>(selector);
	expect(button).not.toBeNull();
	button!.click();
}

describe.each([false, true])('nested public renderer boundaries (StrictMode: %s)', (strict) => {
	it('keeps state, refs, and subscriptions through Octane → React → Octane and releases both renderers', async () => {
		const { props, ping } = fixture(strict);
		let mounted!: ReturnType<typeof mount>;
		await run(() => {
			mounted = mount(OctaneOuter, props);
			dispose.push(() => mounted.unmount());
		});
		const octaneButton = props.octaneRef.current;
		const reactButton = props.reactRef.current;
		expect(octaneButton?.textContent).toBe('first:octane:0');
		expect(reactButton?.textContent).toBe('first:react:0');
		ping(['octane:first', 'react:first']);

		await run(() => {
			octaneButton!.click();
			reactButton!.click();
		});
		expect(octaneButton?.textContent).toBe('first:octane:1');
		expect(reactButton?.textContent).toBe('first:react:1');
		await run(() => mounted.update(OctaneOuter, { ...props, label: 'next' }));
		expect(props.octaneRef.current).toBe(octaneButton);
		expect(props.reactRef.current).toBe(reactButton);
		expect(octaneButton?.textContent).toBe('next:octane:1');
		expect(reactButton?.textContent).toBe('next:react:1');
		ping(['octane:next', 'react:next']);

		// This deletion starts in a React commit, while the outer Octane root survives.
		await run(() => click(mounted.container, '[data-toggle-octane]'));
		expect(props.octaneRef.current).toBeNull();
		expect(octaneButton?.isConnected).toBe(false);
		expect(props.reactRef.current).toBe(reactButton);
		ping(['react:next']);
		await run(() => click(mounted.container, '[data-toggle-octane]'));
		expect(props.octaneRef.current?.textContent).toBe('next:octane:0');
		expect(props.octaneRef.current).not.toBe(octaneButton);
		ping(['octane:next', 'react:next']);

		await run(() => mounted.update(OctaneOuter, { ...props, show: false }));
		expect(mounted.container.textContent).toBe('');
		expect(props.octaneRef.current).toBeNull();
		expect(props.reactRef.current).toBeNull();
		ping([]);
	});

	it('keeps state through React → Octane → React and safely deletes the inner root during a React commit', async () => {
		const { props, ping } = fixture(strict);
		const container = document.createElement('div');
		document.body.append(container);
		const root = createReactRoot(container, {
			onUncaughtError: (error) => {
				faults.push(error);
			},
		});
		dispose.push(() => {
			root.unmount();
			container.remove();
		});
		await run(() =>
			root.render(React.createElement(ReactOuter, { ...props, Island: OctaneMiddle })),
		);
		const octaneButton = props.octaneRef.current;
		const reactButton = props.reactRef.current;
		expect(octaneButton?.textContent).toBe('first:octane:0');
		expect(reactButton?.textContent).toBe('first:react:0');
		ping(['octane:first', 'react:first']);
		await run(() => {
			octaneButton!.click();
			reactButton!.click();
		});
		await run(() =>
			root.render(
				React.createElement(ReactOuter, { ...props, label: 'next', Island: OctaneMiddle }),
			),
		);
		expect(props.octaneRef.current).toBe(octaneButton);
		expect(props.reactRef.current).toBe(reactButton);
		expect(octaneButton?.textContent).toBe('next:octane:1');
		expect(reactButton?.textContent).toBe('next:react:1');
		ping(['octane:next', 'react:next']);

		await run(() => click(container, '[data-toggle-nested]'));
		expect(container.querySelector('[data-nested-octane]')).toBeNull();
		expect(container.querySelector('[data-nested-react]')).toBeNull();
		expect(props.octaneRef.current).toBeNull();
		expect(props.reactRef.current).toBeNull();
		expect(octaneButton?.isConnected).toBe(false);
		expect(reactButton?.isConnected).toBe(false);
		ping([]);

		await run(() => click(container, '[data-toggle-nested]'));
		expect(props.octaneRef.current?.textContent).toBe('next:octane:0');
		expect(props.reactRef.current?.textContent).toBe('next:react:0');
		ping(['octane:next', 'react:next']);
		await run(() => {
			root.unmount();
			container.remove();
		});
		dispose.pop();
		expect(props.octaneRef.current).toBeNull();
		expect(props.reactRef.current).toBeNull();
		ping([]);
	});
});
