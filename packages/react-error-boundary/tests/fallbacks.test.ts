import { describe, expect, it, vi } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { BoundaryApp, NestedFailureApp, UnknownFailureApp } from './_fixtures/app.tsrx';

describe('ErrorBoundary fallbacks', () => {
	it.each([
		['fallback', '#fallback', 'plain'],
		['component', '#component-fallback', 'component:boom'],
		['render', '#render-fallback', 'render:boom'],
	] as const)('supports the %s variant', (mode, selector, text) => {
		const onError = vi.fn();
		const error = new Error('boom');
		const root = mount(BoundaryApp, { mode, error, onError });
		expect(root.find(selector).textContent).toBe(text);
		expect(onError).toHaveBeenCalledOnce();
		expect(onError).toHaveBeenCalledWith(error, { componentStack: '' });
		root.unmount();
	});

	it('routes a fallback failure to the outer boundary without reporting an uncommitted inner catch', () => {
		const innerError = vi.fn();
		const outerError = vi.fn();
		const root = mount(NestedFailureApp, {
			value: 'primitive failure',
			innerError,
			outerError,
		});
		expect(root.find('#outer-fallback').textContent).toBe('Error: fallback failed');
		expect(innerError).not.toHaveBeenCalled();
		expect(outerError).toHaveBeenCalledWith(expect.any(Error), { componentStack: '' });
		root.unmount();
	});

	it.each([null, 'string failure', { code: 42 }])(
		'commits one onError callback for a non-Error throw',
		(value) => {
			const onError = vi.fn();
			const root = mount(UnknownFailureApp, { value, onError });
			expect(root.find('#unknown-fallback').textContent).toBe(String(value));
			expect(onError).toHaveBeenCalledOnce();
			expect(onError).toHaveBeenCalledWith(value, { componentStack: '' });
			root.update(UnknownFailureApp, { value, onError });
			expect(onError).toHaveBeenCalledOnce();
			root.unmount();
		},
	);
});
