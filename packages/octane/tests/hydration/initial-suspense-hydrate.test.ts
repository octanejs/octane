import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, hydrateRoot, type Root } from '../../src/index.js';
import { renderToString } from 'octane/server';
import {
	activateStreamedMarkup,
	collectReadableStream,
	resetStreamRuntimeGlobals,
} from '../_server-stream.js';
import { loadServerFixture } from '../_server-fixture.js';
import {
	InitialAdoptionScreen,
	NestedInitialAdoption,
	type AdoptionGate,
	type AdoptionProps,
} from '../_fixtures/initial-suspense-hydration.tsrx';

const server = loadServerFixture<typeof import('../_fixtures/initial-suspense-hydration.tsrx')>(
	'packages/octane/tests/_fixtures/initial-suspense-hydration.tsrx',
);
const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function gate() {
	let resume!: () => void;
	const value: AdoptionGate = {
		pending: false,
		promise: new Promise<void>((resolve) => {
			resume = resolve;
		}),
	};
	return {
		value,
		resolve() {
			value.pending = false;
			resume();
		},
	};
}
function fulfilled(value: string) {
	return Object.assign(Promise.resolve(value), { status: 'fulfilled' as const, value });
}
function setup(gateInChild: boolean, secondGate?: AdoptionGate) {
	const waiting = gate();
	const props: AdoptionProps = {
		gate: waiting.value,
		secondGate,
		gateInChild,
		label: 'server',
		data: fulfilled('server data'),
		siblingData: fulfilled('sibling data'),
		onLifecycle: vi.fn(),
		onRef: vi.fn(),
		onSiblingClick: vi.fn(),
	};
	const container = document.createElement('div');
	document.body.append(container);
	container.innerHTML = renderToString(server.InitialAdoptionScreen, props).html;
	const input = container.querySelector('input')!;
	const sibling = container.querySelector('aside button') as HTMLButtonElement;
	const id = input.id;
	const siblingId = sibling.id;
	input.value = 'user draft';
	input.focus();
	input.setSelectionRange(2, 6);
	props.data = new Promise(() => {});
	props.siblingData = new Promise(() => {});
	waiting.value.pending = true;
	if (secondGate) secondGate.pending = true;
	let root: Root | undefined;
	cleanups.push(() => {
		root?.unmount();
		container.remove();
	});
	root = hydrateRoot(container, InitialAdoptionScreen, props);
	return { props, container, input, sibling, id, siblingId, waiting, root };
}

describe.each([false, true])('initial suspended hydration (gate in child: %s)', (gateInChild) => {
	it('preserves drafts, IDs and data while committing outside siblings', async () => {
		const { props, container, input, sibling, id, siblingId, waiting } = setup(gateInChild);
		await act(() => {});
		expect(container.querySelector('input')).toBe(input);
		expect(input.value).toBe('user draft');
		expect(document.activeElement).toBe(input);
		expect([input.selectionStart, input.selectionEnd]).toEqual([2, 6]);
		expect(props.onLifecycle).not.toHaveBeenCalled();
		expect(props.onRef).not.toHaveBeenCalled();
		expect(container.textContent).not.toContain('Loading');
		await act(() => sibling.click());
		expect(props.onSiblingClick).toHaveBeenCalledOnce();
		expect(sibling.textContent).toBe('sibling data');
		await act(() => waiting.resolve());
		expect(container.querySelector('input')).toBe(input);
		expect(input.id).toBe(id);
		expect(sibling.id).toBe(siblingId);
		expect(id).not.toBe(siblingId);
		expect(container.querySelector('label')!.htmlFor).toBe(id);
		expect(container.querySelector('output')!.textContent).toBe('server data');
		expect(props.onLifecycle).toHaveBeenCalledExactlyOnceWith('mount:server');
		expect(props.onRef).toHaveBeenCalledExactlyOnceWith(input);
		const button = container.querySelector('section button') as HTMLButtonElement;
		await act(() => button.click());
		expect(button.textContent).toBe('1');
	});

	it('retries multiple gates without publishing abandoned effects or refs', async () => {
		const second = gate();
		const { props, container, input, waiting, root } = setup(gateInChild, second.value);
		await act(() => waiting.resolve());
		expect(container.querySelector('input')).toBe(input);
		expect(props.onLifecycle).not.toHaveBeenCalled();
		expect(props.onRef).not.toHaveBeenCalled();
		await act(() => second.resolve());
		expect(container.querySelector('input')).toBe(input);
		expect(props.onLifecycle).toHaveBeenCalledExactlyOnceWith('mount:server');
		expect(props.onRef).toHaveBeenCalledExactlyOnceWith(input);
		await act(() => root.unmount());
		expect(vi.mocked(props.onLifecycle).mock.calls.map(([event]) => event)).toEqual([
			'mount:server',
			'cleanup:server',
		]);
		expect(vi.mocked(props.onRef).mock.calls.map(([node]) => node)).toEqual([input, null]);
	});

	it('accepts new props and ignores an obsolete wakeable', async () => {
		const { props, container, input, waiting, root } = setup(gateInChild);
		const replacement = gate();
		await act(() =>
			root.render(InitialAdoptionScreen, {
				...props,
				gate: replacement.value,
				label: 'replacement',
			}),
		);
		expect(container.querySelector('input')).toBe(input);
		expect(container.querySelector('[data-adopted-label]')!.textContent).toBe('replacement');
		expect(props.onLifecycle).toHaveBeenCalledExactlyOnceWith('mount:replacement');
		await act(() => waiting.resolve());
		expect(container.querySelector('[data-adopted-label]')!.textContent).toBe('replacement');
		expect(props.onLifecycle).toHaveBeenCalledOnce();
	});

	it('routes a rejected retry to the error boundary and preserves its sibling', async () => {
		const { props, container, sibling, waiting } = setup(gateInChild);
		await act(() => {
			waiting.value.error = new Error('unavailable');
			waiting.resolve();
		});
		expect(container.querySelector('[role="alert"]')!.textContent).toBe('unavailable');
		expect(container.querySelector('input')).toBeNull();
		expect(container.querySelector('aside button')).toBe(sibling);
		expect(props.onLifecycle).not.toHaveBeenCalled();
		expect(props.onRef).not.toHaveBeenCalled();
		await act(() => sibling.click());
		expect(props.onSiblingClick).toHaveBeenCalledOnce();
	});

	it('unmounts a waiting boundary without publishing or retrying its children', async () => {
		const { props, container, waiting, root } = setup(gateInChild);
		await act(() => root.unmount());
		await act(() => waiting.resolve());
		expect(container.textContent).toBe('');
		expect(props.onLifecycle).not.toHaveBeenCalled();
		expect(props.onRef).not.toHaveBeenCalled();
	});
});

it('keeps a nested boundary’s server data when a later sibling postpones outer adoption', async () => {
	const waiting = gate();
	const onLifecycle = vi.fn();
	const container = document.createElement('div');
	document.body.append(container);
	container.innerHTML = renderToString(server.NestedInitialAdoption, {
		gate: waiting.value,
		onLifecycle,
		load: () => fulfilled('nested server data'),
	}).html;
	const output = container.querySelector('output')!;
	const serverId = output.id;
	waiting.value.pending = true;
	const root = hydrateRoot(container, NestedInitialAdoption, {
		gate: waiting.value,
		onLifecycle,
		load: () => new Promise<string>(() => {}),
	});
	cleanups.push(() => {
		root.unmount();
		container.remove();
	});
	await act(() => {});
	expect(onLifecycle).not.toHaveBeenCalled();
	await act(() => waiting.resolve());
	expect(container.querySelector('output')).toBe(output);
	expect(output.textContent).toBe('nested server data');
	expect(output.id).toBe(serverId);
	expect(container.textContent).not.toContain('loading');
	expect(onLifecycle).toHaveBeenCalledExactlyOnceWith('nested server data');
});

it.each(['resolve', 'reject', 'unmount'] as const)(
	'settles already-streamed content while client hydration waits: %s',
	async (settlement) => {
		const waiting = gate();
		waiting.value.pending = true;
		const props: AdoptionProps = {
			gate: waiting.value,
			label: 'streamed',
			data: fulfilled('streamed data'),
			siblingData: fulfilled('shell data'),
			onLifecycle: vi.fn(),
			onRef: vi.fn(),
			onSiblingClick: vi.fn(),
		};
		const streaming = collectReadableStream(server.InitialAdoptionScreen, props);
		await Promise.resolve();
		waiting.resolve();
		const container = document.createElement('div');
		document.body.append(container);
		const { html, errors, chunks } = await streaming;
		expect(errors).toEqual([]);
		expect(chunks[0]).toContain('Loading');
		container.innerHTML = html;
		activateStreamedMarkup(container);
		const input = container.querySelector('input')!;
		expect(input).not.toBeNull();
		const id = input.id;
		input.value = 'stream draft';
		input.focus();
		const clientGate = gate();
		clientGate.value.pending = true;
		const root = hydrateRoot(container, InitialAdoptionScreen, {
			...props,
			gate: clientGate.value,
			data: new Promise<string>(() => {}),
			siblingData: new Promise<string>(() => {}),
		});
		cleanups.push(() => {
			root.unmount();
			container.remove();
			resetStreamRuntimeGlobals();
		});
		await act(() => {});
		expect(container.querySelector('input')).toBe(input);
		expect(container.textContent).not.toContain('Loading');
		expect(props.onLifecycle).not.toHaveBeenCalled();
		if (settlement !== 'resolve') {
			await act(() => {
				if (settlement === 'unmount') root.unmount();
				else clientGate.value.error = new Error('stream unavailable');
				clientGate.resolve();
			});
			expect(container.querySelector('input')).toBeNull();
			expect(props.onLifecycle).not.toHaveBeenCalled();
			expect(props.onRef).not.toHaveBeenCalled();
			if (settlement === 'reject') {
				expect(container.querySelector('[role="alert"]')?.textContent).toBe('stream unavailable');
			} else expect(container.textContent).toBe('');
			return;
		}
		await act(() => clientGate.resolve());
		expect(container.querySelector('input')).toBe(input);
		expect(input.id).toBe(id);
		expect(input.value).toBe('stream draft');
		expect(document.activeElement).toBe(input);
		expect(container.querySelector('output')!.textContent).toBe('streamed data');
		expect(props.onLifecycle).toHaveBeenCalledExactlyOnceWith('mount:streamed');
	},
);

it('replays streamed child data after its enclosing hydration attempt is abandoned', async () => {
	const waiting = gate();
	let resolveData!: (value: string) => void;
	const data = new Promise<string>((resolve) => {
		resolveData = resolve;
	});
	const onLifecycle = vi.fn();
	const streaming = collectReadableStream(server.NestedInitialAdoption, {
		gate: waiting.value,
		onLifecycle,
		load: () => data,
	});
	await Promise.resolve();
	resolveData('nested streamed data');
	const { html, errors, chunks } = await streaming;
	expect(errors).toEqual([]);
	expect(chunks[0]).toContain('Inner loading');
	const container = document.createElement('div');
	document.body.append(container);
	container.innerHTML = html;
	activateStreamedMarkup(container);
	const output = container.querySelector('output')!;
	expect(output.textContent).toBe('nested streamed data');
	const id = output.id;
	waiting.value.pending = true;
	const root = hydrateRoot(container, NestedInitialAdoption, {
		gate: waiting.value,
		onLifecycle,
		load: () => new Promise<string>(() => {}),
	});
	cleanups.push(() => {
		root.unmount();
		container.remove();
		resetStreamRuntimeGlobals();
	});
	await act(() => {});
	expect(container.querySelector('output')).toBe(output);
	expect(onLifecycle).not.toHaveBeenCalled();
	await act(() => waiting.resolve());
	expect(container.querySelector('output')).toBe(output);
	expect(output.id).toBe(id);
	expect(output.textContent).toBe('nested streamed data');
	expect(container.textContent).not.toContain('loading');
	expect(onLifecycle).toHaveBeenCalledExactlyOnceWith('nested streamed data');
});
