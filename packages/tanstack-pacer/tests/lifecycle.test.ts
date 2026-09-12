import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import {
	SchedulerLifecycle,
	NestedPacerProviders,
	SubscribeBlockChildren,
	SubscribeRenderProp,
} from './_fixtures/pacer.tsrx';

afterEach(() => document.body.replaceChildren());

describe('Pacer scheduler identity and ownership', () => {
	// @parity-case conformance:pacer-scheduler-ownership
	it('preserves every scheduler store through renders and tears each owner down once', () => {
		const onSnapshot = vi.fn();
		const onUnmount = vi.fn();
		const result = mount(SchedulerLifecycle, { revision: 0, onSnapshot, onUnmount });
		try {
			flushEffects();
			const first = onSnapshot.mock.calls.at(-1)![0] as unknown[];
			expect(first).toHaveLength(10);
			expect(new Set(first).size).toBe(10);
			result.update(SchedulerLifecycle, { revision: 1, onSnapshot, onUnmount });
			flushEffects();
			const second = onSnapshot.mock.calls.at(-1)![0] as unknown[];
			for (let i = 0; i < first.length; i++) expect(second[i]).toBe(first[i]);
			expect(onUnmount).not.toHaveBeenCalled();
		} finally {
			result.unmount();
		}
		expect(onUnmount.mock.calls.map(([name]) => name).sort()).toEqual([
			'asyncBatcher',
			'asyncDebouncer',
			'asyncLimiter',
			'asyncQueuer',
			'asyncThrottler',
			'batcher',
			'debouncer',
			'limiter',
			'queuer',
			'throttler',
		]);
	});
	// @parity-case conformance:pacer-nested-providers
	it('isolates nested defaults and updates the owning provider', () => {
		const result = mount(NestedPacerProviders, { wait: 40 });
		try {
			expect(result.find('#unprovided').textContent).toBe('undefined:false');
			expect(result.find('#outer').textContent).toBe('40:true');
			expect(result.find('#inner').textContent).toBe('80:true');
			result.update(NestedPacerProviders, { wait: 60 });
			expect(result.find('#outer').textContent).toBe('60:true');
			expect(result.find('#inner').textContent).toBe('80:true');
		} finally {
			result.unmount();
		}
	});
});

describe('Pacer Subscribe children', () => {
	it('renders compiled block children without invoking them as render props', () => {
		const result = mount(SubscribeBlockChildren, {});
		try {
			expect(result.find('#batcher-block').textContent).toBe('ok');
			expect(result.find('#debouncer-block').textContent).toBe('ok');
			expect(result.find('#queuer-block').textContent).toBe('ok');
			expect(result.find('#limiter-block').textContent).toBe('ok');
			expect(result.find('#throttler-block').textContent).toBe('ok');
			expect(result.find('#async-batcher-block').textContent).toBe('ok');
			expect(result.find('#async-debouncer-block').textContent).toBe('ok');
			expect(result.find('#async-queuer-block').textContent).toBe('ok');
			expect(result.find('#async-limiter-block').textContent).toBe('ok');
			expect(result.find('#async-throttler-block').textContent).toBe('ok');
		} finally {
			result.unmount();
		}
	});

	it('still calls a genuine render-prop child with the selected snapshot', () => {
		const result = mount(SubscribeRenderProp, {});
		try {
			expect(result.find('#rp-child').textContent).toBe('idle');
		} finally {
			result.unmount();
		}
	});
});
