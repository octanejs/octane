import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as React from 'react';
import { jsx } from 'react/jsx-runtime';
import { createRoot, type Root } from 'react-dom/client';
import { mount, type MountResult } from '../_helpers.js';
import {
	ComponentTransportApp,
	DefaultedClassApp,
	DefaultedFunctionApp,
	DirectCounterApp,
	LiteralCounterApp,
	ReexportedCounterApp,
} from './authoring.tsrx';
import {
	ClassCounter,
	Counter,
	DefaultedClass,
	DefaultedFunction,
	ForwardedCounter,
	LazyCounter,
	MemoCounter,
} from './react-components.js';

const reactEnvironment = globalThis as typeof globalThis & {
	IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const originalActEnvironment = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
const octaneMounts: MountResult[] = [];
const reactMounts: { root: Root; container: HTMLElement }[] = [];

beforeAll(() => {
	reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
	await React.act(async () => {
		for (const mounted of octaneMounts.splice(0)) mounted.unmount();
		for (const { root, container } of reactMounts.splice(0)) {
			root.unmount();
			container.remove();
		}
	});
});

afterAll(() => {
	if (originalActEnvironment === undefined) delete reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
	else reactEnvironment.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});

async function mountOctane<P>(body: Parameters<typeof mount<P>>[0], props: P) {
	let mounted!: MountResult;
	await React.act(async () => {
		mounted = mount(body, props);
		octaneMounts.push(mounted);
	});
	return mounted;
}

async function renderReact(element: React.ReactNode): Promise<HTMLElement> {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	reactMounts.push({ root, container });
	await React.act(async () => root.render(element));
	return container;
}

describe('React component children through the existing descriptor transport', () => {
	it('accepts a single Counter child with the requested literal props syntax', async () => {
		const mounted = await mountOctane(LiteralCounterApp, undefined);
		expect(mounted.find('button').textContent).toBe('count:3');
		await React.act(async () => mounted.click('button'));
		expect(mounted.find('button').textContent).toBe('count:4');
	});

	for (const [label, App] of [
		['direct import', DirectCounterApp],
		['barrel re-export and imported alias', ReexportedCounterApp],
	] as const) {
		it(`executes React hooks and preserves child state through ${label}`, async () => {
			const mounted = await mountOctane(App, { start: 3, label: 'first' });
			const button = mounted.find('button');
			expect(button.textContent).toBe('first:3');
			await React.act(async () => mounted.click('button'));
			expect(button.textContent).toBe('first:4');
			await React.act(async () => mounted.update(App, { start: 100, label: 'updated' }));
			expect(mounted.find('button')).toBe(button);
			expect(button.textContent).toBe('updated:4');
		});
	}

	it('carries the child key separately from props so a key change resets React state', async () => {
		const mounted = await mountOctane(DirectCounterApp, {
			start: 3,
			label: 'keyed',
			childKey: 'first',
		});
		const button = mounted.find('button');
		await React.act(async () => mounted.click('button'));
		expect(button.textContent).toBe('keyed:4');
		await React.act(async () =>
			mounted.update(DirectCounterApp, { start: 10, label: 'keyed', childKey: 'second' }),
		);
		expect(mounted.find('button')).not.toBe(button);
		expect(mounted.find('button').textContent).toBe('keyed:10');
	});

	it('leaves React 19 ref props owned by the child and detaches them on deletion', async () => {
		const ref = React.createRef<HTMLButtonElement>();
		const mounted = await mountOctane(DirectCounterApp, { start: 3, label: 'ref', ref });
		expect(ref.current).toBe(mounted.find('button'));
		await React.act(async () => mounted.update(DirectCounterApp, { start: 9, label: 'next', ref }));
		expect(ref.current?.textContent).toBe('next:3');
		await React.act(async () => mounted.unmount());
		octaneMounts.splice(octaneMounts.indexOf(mounted), 1);
		expect(ref.current).toBeNull();
	});

	it('snapshots inputs before a queued React render instead of exposing live Octane props', async () => {
		const props = { start: 3, label: 'captured' };
		let mounted!: MountResult;
		await React.act(async () => {
			mounted = mount(DirectCounterApp, props);
			octaneMounts.push(mounted);
			props.label = 'mutated-after-Octane-render';
		});
		expect(mounted.find('button').textContent).toBe('captured:3');
	});

	for (const [label, component] of [
		['function', Counter],
		['class', ClassCounter],
		['memo', MemoCounter],
		['forwardRef', ForwardedCounter],
		['lazy', LazyCounter],
	] as const) {
		it(`transports the real ${label} component identity without invoking it as Octane`, async () => {
			const mounted = await mountOctane(ComponentTransportApp, {
				component,
				start: 3,
				label,
			});
			expect(mounted.find('button').textContent).toBe(`${label}:3`);
			await React.act(async () => mounted.click('button'));
			expect(mounted.find('button').textContent).toBe(`${label}:4`);
		});
	}
});

describe('defaultProps normalization limits of generic descriptor transport', () => {
	it('records that function defaults match createElement but differ from React automatic JSX', async () => {
		const transported = await mountOctane(DefaultedFunctionApp, { label: undefined });
		const classic = await renderReact(React.createElement(DefaultedFunction, { label: undefined }));
		const automatic = await renderReact(jsx(DefaultedFunction, { label: undefined }));
		expect(transported.find('span').textContent).toBe('legacy-function-default');
		expect(classic.textContent).toBe('legacy-function-default');
		expect(automatic.textContent).toBe('missing');
	});

	it('preserves class defaults across descriptor transport and both React element factories', async () => {
		const transported = await mountOctane(DefaultedClassApp, { label: undefined });
		const classic = await renderReact(React.createElement(DefaultedClass, { label: undefined }));
		const automatic = await renderReact(jsx(DefaultedClass, { label: undefined }));
		expect(transported.find('span').textContent).toBe('class-default');
		expect(classic.textContent).toBe('class-default');
		expect(automatic.textContent).toBe('class-default');
	});
});
