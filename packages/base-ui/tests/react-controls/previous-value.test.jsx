import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { createRenderer, screen } from '@mui/internal-test-utils';
import { usePreviousValue } from '@base-ui/utils/usePreviousValue';

describe('upstream previous value during Suspense', () => {
	const { render } = createRenderer({ strict: false });
	it('retains the last committed value when a render is abandoned', async () => {
		function Value({ value, resource }) {
			const previous = usePreviousValue(value);
			if (resource) React.use(resource);
			return <output data-testid="previous">{previous ?? 'initial'}</output>;
		}
		const example = (value, resource) => (
			<React.Suspense fallback={<output>pending</output>}>
				<Value value={value} resource={resource} />
			</React.Suspense>
		);
		const view = render(example('committed'));
		await React.act(async () => view.rerender(example('abandoned', new Promise(() => {}))));
		await React.act(async () => view.rerender(example('replacement')));
		expect(screen.getByTestId('previous').textContent).toBe('committed');
	});
});
