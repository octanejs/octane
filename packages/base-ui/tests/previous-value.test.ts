import { describe, expect, it } from 'vitest';
import { createElement, Suspense, use } from 'octane';
import { mount } from '../../octane/tests/_helpers';
import { usePreviousValue } from '../src/utils/usePreviousValue';

interface PreviousValueProps {
	value: string | number;
	resource?: Promise<void> | null;
}

const PREVIOUS_VALUE_SLOT = Symbol('base-ui-previous-value');

function PreviousValue(props: PreviousValueProps) {
	const previous = usePreviousValue<string | number>(props.value, PREVIOUS_VALUE_SLOT);
	if (props.resource != null) use(props.resource);
	return createElement('output', { 'data-testid': 'previous-value' }, previous ?? 'initial');
}

function PreviousValueBoundary(props: PreviousValueProps) {
	return createElement(
		Suspense,
		{ fallback: createElement('output', { 'data-testid': 'pending' }, 'pending') },
		createElement(PreviousValue, props),
	);
}

describe('@octanejs/base-ui — previous distinct value', () => {
	it('starts empty and retains the previous distinct committed value', () => {
		const result = mount(PreviousValueBoundary, { value: 'first' });
		try {
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('initial');

			result.update(PreviousValueBoundary, { value: 'second' });
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('first');

			result.update(PreviousValueBoundary, { value: 'second' });
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('first');

			result.update(PreviousValueBoundary, { value: 'third' });
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('second');
		} finally {
			result.unmount();
		}
	});

	it('does not treat positive and negative zero as distinct values', () => {
		const result = mount(PreviousValueBoundary, { value: 0 });
		try {
			result.update(PreviousValueBoundary, { value: -0 });
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('initial');
		} finally {
			result.unmount();
		}
	});

	it('does not publish previous-value history from an abandoned Suspense render', () => {
		const pending = new Promise<void>(() => {});
		const result = mount(PreviousValueBoundary, { value: 'committed' });
		try {
			result.update(PreviousValueBoundary, { value: 'abandoned', resource: pending });

			result.update(PreviousValueBoundary, { value: 'replacement', resource: null });
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('committed');
		} finally {
			result.unmount();
		}
	});
});
