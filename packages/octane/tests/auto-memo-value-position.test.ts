import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { act, flushEffects, mount } from './_helpers';
import { loadServerFixture } from './_server-fixture';
import {
	CachedValuePositionRows,
	CachedValuePositionActivity,
	CachedValuePositionMemoContext,
	CachedValuePositionRoundTrip,
	CachedValuePositionSuspense,
	CachedValuePositionTransition,
	drainValuePositionActivityEffects,
	drainValuePositionLayoutEffects,
	EscapedValuePositionRows,
	SetupEscapedValuePositionRows,
} from './_fixtures/auto-memo-value-position.tsrx';

function fulfilledValue(value: string): PromiseLike<string> {
	const promise = Promise.resolve(value) as Promise<string> & {
		status: 'fulfilled';
		value: string;
	};
	promise.status = 'fulfilled';
	promise.value = value;
	return promise;
}

describe('cached value-position children', () => {
	it('keeps cached rows reactive to context, their own state, and immutable parent changes', () => {
		const root = mount(CachedValuePositionRows);
		const first = root.find('.memo-value-row');
		const input = root.find('.memo-value-input-1') as HTMLInputElement;
		input.value = 'preserved draft';

		root.click('.memo-value-own-1');
		expect(root.find('.memo-value-own-1').textContent).toBe('initial:first:1');

		root.click('#memo-value-tick');
		expect(root.find('.memo-value-row')).toBe(first);
		expect(input.value).toBe('preserved draft');

		root.click('#memo-value-theme');
		expect(root.find('.memo-value-own-1').textContent).toBe('initial!:first:1');
		expect(root.find('.memo-value-own-2').textContent).toBe('initial!:second:0');

		root.click('#memo-value-change');
		expect(root.find('.memo-value-row')).toBe(first);
		expect(root.find('.memo-value-own-1').textContent).toBe('initial!:first!:1');
		expect(input.value).toBe('preserved draft');

		root.click('#memo-value-reorder');
		expect(root.findAll('.memo-value-row').map((row) => row.getAttribute('data-id'))).toEqual([
			'2',
			'1',
		]);
		expect(root.findAll('.memo-value-row')[1]).toBe(first);
		expect(root.find('.memo-value-own-1').textContent).toBe('initial!:first!:1');
		root.unmount();
	});

	it('keeps outer context live after a memo ancestor re-renders past cached rows', () => {
		const root = mount(CachedValuePositionMemoContext);
		expect(root.find('.memo-value-own-1').textContent).toBe('initial:first:0');
		expect(root.find('.memo-value-own-2').textContent).toBe('initial:second:0');

		root.click('#memo-value-boundary-tick');
		expect(root.find('#memo-value-boundary-rows').getAttribute('data-tick')).toBe('1');
		expect(root.find('.memo-value-own-1').textContent).toBe('initial:first:0');

		root.click('#memo-value-boundary-theme');
		expect(root.find('.memo-value-own-1').textContent).toBe('initial!:first:0');
		expect(root.find('.memo-value-own-2').textContent).toBe('initial!:second:0');
		root.unmount();
	});

	it('rebuilds a previously cached array after its value position temporarily holds text', () => {
		const root = mount(CachedValuePositionRoundTrip);
		const original = root.find('.memo-value-own-1');
		expect(original.textContent).toBe('initial:first:0');

		root.click('#memo-value-round-trip-toggle');
		expect(root.find('#memo-value-round-trip-rows').textContent).toBe('temporarily hidden');
		expect(root.findAll('.memo-value-row')).toHaveLength(0);

		root.click('#memo-value-round-trip-toggle');
		const restored = root.find('.memo-value-own-1');
		expect(restored).not.toBe(original);
		expect(restored.textContent).toBe('initial:first:0');
		expect(root.findAll('.memo-value-row')).toHaveLength(2);

		root.click('#memo-value-round-trip-theme');
		expect(restored.textContent).toBe('initial!:first:0');
		root.click('.memo-value-own-1');
		expect(restored.textContent).toBe('initial!:first:1');
		root.unmount();
	});

	it('reconciles a derived array that escapes into an event handler and mutates in place', () => {
		const root = mount(EscapedValuePositionRows);
		const before = root.findAll('.memo-value-row');

		root.click('#memo-value-mutate');
		expect(root.findAll('.memo-value-row')).toEqual([before[1], before[0]]);

		root.click('#memo-value-mutate');
		expect(root.findAll('.memo-value-row')).toEqual(before);
		root.unmount();
	});

	it('reconciles a derived array that escapes into a setup closure and mutates in place', () => {
		const root = mount(SetupEscapedValuePositionRows);
		const before = root.findAll('.memo-value-row');

		root.click('#memo-value-setup-mutate');
		expect(root.findAll('.memo-value-row')).toEqual([before[1], before[0]]);
		root.unmount();
	});

	it('adopts cached rows during hydration and preserves drafts, events, and context updates', () => {
		const server = loadServerFixture(
			'packages/octane/tests/_fixtures/auto-memo-value-position.tsrx',
			{
				compileOptions: { hmr: false, dev: false },
			},
		);
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = ServerRuntime.renderToString(server.CachedValuePositionRows).html;
		const originalRows = Array.from(container.querySelectorAll('.memo-value-row'));
		const originalInput = container.querySelector('.memo-value-input-1') as HTMLInputElement;
		originalInput.value = 'typed before hydration';

		const root = hydrateRoot(container, CachedValuePositionRows);
		flushSync(() => {});
		expect(Array.from(container.querySelectorAll('.memo-value-row'))).toEqual(originalRows);
		expect(container.querySelector('.memo-value-input-1')).toBe(originalInput);
		expect(originalInput.value).toBe('typed before hydration');

		flushSync(() => (container.querySelector('#memo-value-theme') as HTMLButtonElement).click());
		expect(container.querySelector('.memo-value-own-1')?.textContent).toBe('initial!:first:0');
		expect(container.querySelector('.memo-value-own-2')?.textContent).toBe('initial!:second:0');
		expect(originalInput.value).toBe('typed before hydration');
		root.unmount();
		container.remove();
	});

	it('reconnects reordered memo-row effects in source order when an Activity becomes visible', () => {
		drainValuePositionActivityEffects();
		drainValuePositionLayoutEffects();
		const root = mount(CachedValuePositionActivity, { mode: 'visible' as const });
		flushEffects();
		expect(drainValuePositionActivityEffects()).toEqual(['mount:1', 'mount:2']);
		expect(drainValuePositionLayoutEffects()).toEqual(['mount:1', 'mount:2']);

		root.click('#memo-value-activity-reorder');
		flushEffects();
		expect(root.findAll('.memo-value-activity-row').map((row) => row.textContent)).toEqual([
			'second',
			'first',
		]);
		expect(drainValuePositionActivityEffects()).toEqual([]);
		expect(drainValuePositionLayoutEffects()).toEqual([]);

		root.update(CachedValuePositionActivity, { mode: 'hidden' });
		flushEffects();
		expect(drainValuePositionActivityEffects()).toEqual(['cleanup:2', 'cleanup:1']);
		expect(drainValuePositionLayoutEffects()).toEqual(['cleanup:2', 'cleanup:1']);

		root.update(CachedValuePositionActivity, { mode: 'visible' });
		flushEffects();
		expect(drainValuePositionActivityEffects()).toEqual(['mount:2', 'mount:1']);
		expect(drainValuePositionLayoutEffects()).toEqual(['mount:2', 'mount:1']);
		root.unmount();
		drainValuePositionActivityEffects();
		drainValuePositionLayoutEffects();
	});

	it('reconnects cached memo-row layout effects after a Suspense fallback reveals', async () => {
		drainValuePositionActivityEffects();
		drainValuePositionLayoutEffects();
		let resolve!: (value: string) => void;
		const pending = new Promise<string>((complete) => {
			resolve = complete;
		});
		const root = mount(CachedValuePositionSuspense, { promise: fulfilledValue('initial') });
		flushEffects();
		expect(drainValuePositionActivityEffects()).toEqual(['mount:1', 'mount:2']);
		expect(drainValuePositionLayoutEffects()).toEqual(['mount:1', 'mount:2']);

		root.update(CachedValuePositionSuspense, { promise: pending });
		flushEffects();
		expect(root.find('#memo-value-suspense-pending').textContent).toBe('loading');
		expect(drainValuePositionLayoutEffects()).toEqual(['cleanup:1', 'cleanup:2']);
		expect(drainValuePositionActivityEffects()).toEqual([]);

		await act(() => resolve('resolved'));
		flushEffects();
		expect(root.findAll('#memo-value-suspense-pending')).toHaveLength(0);
		expect(root.find('#memo-value-suspense-detail').textContent).toBe('resolved');
		expect(drainValuePositionLayoutEffects()).toEqual(['mount:1', 'mount:2']);
		expect(drainValuePositionActivityEffects()).toEqual([]);
		root.unmount();
		drainValuePositionActivityEffects();
		drainValuePositionLayoutEffects();
	});

	it('rolls cached rows back during a held transition and reapplies them when it resolves', async () => {
		const initialPromise = fulfilledValue('initial');
		let resolve!: (value: string) => void;
		const nextPromise = new Promise<string>((complete) => {
			resolve = complete;
		});
		const root = mount(CachedValuePositionTransition, { initialPromise, nextPromise });
		const initialRows = root.findAll('#memo-value-transition-rows .memo-value-row');
		const labels = () =>
			root.findAll('#memo-value-transition-rows button').map((row) => row.textContent);
		expect(labels()).toEqual(['initial:first:0', 'initial:second:0']);

		root.click('#memo-value-transition-bump');
		expect(root.findAll('#memo-value-transition-rows .memo-value-row')).toEqual(initialRows);
		expect(labels()).toEqual(['initial:first:0', 'initial:second:0']);
		expect(root.findAll('#memo-value-transition-pending')).toHaveLength(0);

		await act(() => resolve('resolved'));
		expect(root.findAll('#memo-value-transition-rows .memo-value-row')).toEqual([
			initialRows[1],
			initialRows[0],
		]);
		expect(labels()).toEqual(['initial:pending second:0', 'initial:pending first:0']);
		expect(root.find('#memo-value-suspense-detail').textContent).toBe('resolved');

		root.click('#memo-value-transition-urgent');
		expect(labels()).toEqual(['initial:urgent second:0', 'initial:urgent first:0']);
		root.unmount();
	});
});
