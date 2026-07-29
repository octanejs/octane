import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => {
	document.body.innerHTML = '';
});

describe('react-error-boundary 6.1.2 differential oracle', () => {
	it('reports and resets an imperative failure in the supported callback order', async () => {
		const trace: string[] = [];
		let shouldFail = true;

		function Thrower() {
			if (shouldFail) throw new Error('oracle');
			return React.createElement('span', { id: 'react-content' }, 'content');
		}
		function App() {
			const [, rerender] = useState(0);
			return React.createElement(
				ErrorBoundary,
				{
					onError: (error: Error) => trace.push('error:' + error.message),
					onReset: (details: { reason: string }) => trace.push('reset:' + details.reason),
					fallbackRender: ({ resetErrorBoundary }) =>
						React.createElement(
							'button',
							{
								id: 'react-reset',
								onClick: () => {
									shouldFail = false;
									rerender((value) => value + 1);
									resetErrorBoundary();
								},
							},
							'retry',
						),
				},
				React.createElement(Thrower),
			);
		}

		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		await act(() => root.render(React.createElement(App)));
		await act(() => (container.querySelector('#react-reset') as HTMLButtonElement).click());

		expect(container.querySelector('#react-content')?.textContent).toBe('content');
		expect(trace).toEqual(['error:oracle', 'reset:imperative-api']);
		await act(() => root.unmount());
	});
});
