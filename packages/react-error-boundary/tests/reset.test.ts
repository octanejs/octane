import { describe, expect, it, vi } from 'vitest';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import { BoundaryApp, LocalResetApp } from './_fixtures/app.tsrx';

describe('ErrorBoundary reset', () => {
	it('resets imperatively with callback arguments', () => {
		const onReset = vi.fn();
		const root = mount(LocalResetApp);
		root.click('#local-reset');
		expect(root.find('#content').textContent).toBe('content');
		root.unmount();

		const app = mount(BoundaryApp, {
			mode: 'render',
			error: new Error('boom'),
			onReset,
		});
		app.click('#render-fallback');
		expect(onReset).toHaveBeenCalledWith({
			args: ['render-retry'],
			reason: 'imperative-api',
		});
		app.unmount();
	});

	it('commits onError once before reporting the reset', () => {
		const trace: string[] = [];
		const root = mount(LocalResetApp, {
			onError: (error) => trace.push('error:' + String(error)),
			onReset: (details: any) => trace.push('reset:' + details.reason),
		});
		expect(trace).toEqual(['error:Error: local']);
		root.update(LocalResetApp, {
			onError: (error) => trace.push('error:' + String(error)),
			onReset: (details: any) => trace.push('reset:' + details.reason),
		});
		expect(trace).toEqual(['error:Error: local']);
		root.click('#local-reset');
		expect(trace).toEqual(['error:Error: local', 'reset:imperative-api']);
		root.unmount();
	});

	it('resets once only after resetKeys change while caught', () => {
		const onReset = vi.fn();
		const error = new Error('boom');
		const root = mount(BoundaryApp, {
			mode: 'fallback',
			error,
			resetKeys: ['a'],
			onReset,
		});
		flushEffects();
		expect(onReset).not.toHaveBeenCalled();
		root.update(BoundaryApp, {
			mode: 'fallback',
			error: undefined,
			resetKeys: ['a'],
			onReset,
		});
		flushEffects();
		expect(onReset).not.toHaveBeenCalled();
		root.update(BoundaryApp, {
			mode: 'fallback',
			error: undefined,
			resetKeys: ['b'],
			onReset,
		});
		flushEffects();
		expect(root.find('#content').textContent).toBe('content');
		expect(onReset).toHaveBeenCalledOnce();
		expect(onReset).toHaveBeenCalledWith({
			next: ['b'],
			prev: ['a'],
			reason: 'keys',
		});
		root.unmount();
	});

	it('uses keys from the caught render as the baseline', () => {
		const onReset = vi.fn();
		const root = mount(BoundaryApp, {
			mode: 'fallback',
			error: undefined,
			resetKeys: ['before'],
			onReset,
		});
		root.update(BoundaryApp, {
			mode: 'fallback',
			error: undefined,
			resetKeys: ['at-failure'],
			onReset,
		});
		root.update(BoundaryApp, {
			mode: 'fallback',
			error: new Error('boom'),
			resetKeys: ['at-failure'],
			onReset,
		});
		flushEffects();
		expect(root.find('#fallback')).toBeTruthy();
		expect(onReset).not.toHaveBeenCalled();
		root.unmount();
	});
});
