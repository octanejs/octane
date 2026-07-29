import { describe, expect, it } from 'vitest';
import * as api from '@octanejs/react-error-boundary';
import { mount } from '../../octane/tests/_helpers';
import { WrappedGreeting } from './_fixtures/app.tsrx';

describe('public API', () => {
	it('exports the supported runtime surface', () => {
		expect(Object.keys(api).sort()).toEqual([
			'ErrorBoundary',
			'ErrorBoundaryContext',
			'getErrorMessage',
			'useErrorBoundary',
			'withErrorBoundary',
		]);
	});

	it('exports upstream getErrorMessage behavior', () => {
		expect(api.getErrorMessage('plain')).toBe('plain');
		expect(api.getErrorMessage({ message: 'object' })).toBe('object');
		expect(api.getErrorMessage({ message: 42 })).toBeUndefined();
		expect(api.getErrorMessage(null)).toBeUndefined();
	});

	it('withErrorBoundary forwards props and reports its display name', () => {
		const root = mount(WrappedGreeting, { name: 'Octane' });
		expect(root.find('#greeting').textContent).toBe('Hello Octane');
		expect(WrappedGreeting.displayName).toBe('withErrorBoundary(Greeting)');
		root.update(WrappedGreeting, { name: 'Octane', fail: true });
		expect(root.find('#wrapped-fallback').textContent).toBe('wrapped fallback');
		root.unmount();
	});
});
