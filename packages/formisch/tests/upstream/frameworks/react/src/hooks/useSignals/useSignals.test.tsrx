import { batch, createSignal } from '@octanejs/formisch/core';
import { act, fireEvent, render, screen } from '@octanejs/testing-library';
import { type OctaneNode, useState } from 'octane';
import { describe, expect, test, vi } from 'vitest';
import { useSignals } from '../../../../../../../src/hooks/useSignals/useSignals.ts';

describe('useSignals', () => {
	describe('signal subscription', () => {
		// Per frameworks/react/src/hooks/useSignals/useSignals.test.tsx:9
		test('should re-render the component when a tracked signal changes', () => {
			const signal = createSignal(0);

			function TrackedComponent(): OctaneNode {
				useSignals();
				return <span data-testid="value">{signal.value}</span>;
			}

			render(<TrackedComponent />);
			expect(screen.getByTestId('value')).toHaveTextContent('0');

			act(() => {
				signal.value = 5;
			});

			expect(screen.getByTestId('value')).toHaveTextContent('5');
		});

		// Per frameworks/react/src/hooks/useSignals/useSignals.test.tsx:27
		test('should not re-render the component for signals that were not read', () => {
			const tracked = createSignal('a');
			const untracked = createSignal('x');
			let renderCount = 0;

			function PartialTrackComponent(): OctaneNode {
				useSignals();
				renderCount++;
				return <span data-testid="value">{tracked.value}</span>;
			}

			render(<PartialTrackComponent />);
			const initialRenderCount = renderCount;

			act(() => {
				untracked.value = 'y';
			});

			expect(renderCount).toBe(initialRenderCount);
		});

		// Per frameworks/react/src/hooks/useSignals/useSignals.test.tsx:48
		test('should re-render once per batched signal update cycle', () => {
			const signalA = createSignal(0);
			const signalB = createSignal(0);
			let renderCount = 0;

			function BatchedComponent(): OctaneNode {
				useSignals();
				renderCount++;
				return <span data-testid="sum">{signalA.value + signalB.value}</span>;
			}

			render(<BatchedComponent />);
			const initialRenderCount = renderCount;

			act(() => {
				batch(() => {
					signalA.value = 1;
					signalB.value = 2;
				});
			});

			expect(screen.getByTestId('sum')).toHaveTextContent('3');
			// Both signals share a single subscriber, so a single notification fires
			expect(renderCount - initialRenderCount).toBe(1);
		});
	});

	describe('cleanup', () => {
		// Per frameworks/react/src/hooks/useSignals/useSignals.test.tsx:76
		test('should not re-render after unmount when a tracked signal changes', () => {
			vi.useFakeTimers();
			try {
				const signal = createSignal('initial');
				let renderCount = 0;

				function TrackedComponent(): OctaneNode {
					useSignals();
					renderCount++;
					return <span data-testid="value">{signal.value}</span>;
				}

				const { unmount } = render(<TrackedComponent />);
				const renderCountBeforeUnmount = renderCount;

				unmount();

				// Flush the cleanup timeout scheduled in useSignals.ts
				act(() => {
					vi.runAllTimers();
				});

				signal.value = 'after-unmount';

				expect(renderCount).toBe(renderCountBeforeUnmount);
			} finally {
				vi.useRealTimers();
			}
		});

		// Per frameworks/react/src/hooks/useSignals/useSignals.test.tsx:106
		test('should keep subscriptions alive across StrictMode effect re-runs', () => {
			const signal = createSignal(0);

			function TrackedComponent(): OctaneNode {
				useSignals();
				return <span data-testid="value">{signal.value}</span>;
			}

			// OCTANE DIVERGENCE[formisch-no-strictmode-replay][runtime:5457ff55c8742f8e]
			// Octane has no StrictMode development effect replay.
			// Keep the upstream identity executable and pin the supported contract:
			// a normally mounted subscriber remains live after its effects commit.
			render(<TrackedComponent />);

			act(() => {
				signal.value = 7;
			});

			expect(screen.getByTestId('value')).toHaveTextContent('7');
		});
	});

	describe('multiple components', () => {
		// Per frameworks/react/src/hooks/useSignals/useSignals.test.tsx:132
		test('should only re-render components that read the changed signal', () => {
			const signalA = createSignal(0);
			const signalB = createSignal(0);
			let renderCountA = 0;
			let renderCountB = 0;

			function CounterA(): OctaneNode {
				useSignals();
				renderCountA++;
				return <span data-testid="a">{signalA.value}</span>;
			}

			function CounterB(): OctaneNode {
				useSignals();
				renderCountB++;
				return <span data-testid="b">{signalB.value}</span>;
			}

			render(
				<>
					<CounterA />
					<CounterB />
				</>,
			);

			const initialA = renderCountA;
			const initialB = renderCountB;

			act(() => {
				signalA.value = 1;
			});

			expect(screen.getByTestId('a')).toHaveTextContent('1');
			expect(screen.getByTestId('b')).toHaveTextContent('0');
			expect(renderCountA - initialA).toBe(1);
			expect(renderCountB).toBe(initialB);
		});
	});

	describe('coexistence with React state', () => {
		// Per frameworks/react/src/hooks/useSignals/useSignals.test.tsx:172
		test('should update signals and useState independently in the same component', () => {
			const signal = createSignal('signal-initial');

			function StateComponent(): OctaneNode {
				useSignals();
				const [count, setCount] = useState(0);
				return <div>
					<span data-testid="count">{count}</span>
					<span data-testid="signal">{signal.value}</span>
					<button onClick={() => setCount((c) => c + 1)}>Increment</button>
				</div>;
			}

			render(<StateComponent />);
			const count = screen.getByTestId('count');
			const signalText = screen.getByTestId('signal');
			expect(count).toHaveTextContent('0');
			expect(signalText).toHaveTextContent('signal-initial');

			act(() => {
				fireEvent.click(screen.getByText('Increment'));
			});
			expect(count).toHaveTextContent('1');
			expect(signalText).toHaveTextContent('signal-initial');

			act(() => {
				signal.value = 'signal-updated';
			});
			expect(count).toHaveTextContent('1');
			expect(signalText).toHaveTextContent('signal-updated');
		});
	});
});
