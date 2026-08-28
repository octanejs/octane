import { batch, createSignal } from '@formisch/core/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, StrictMode, useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { useSignals } from './useSignals.ts';

describe('useSignals', () => {
  describe('signal subscription', () => {
    test('should re-render the component when a tracked signal changes', () => {
      const signal = createSignal(0);

      function TrackedComponent(): ReactElement {
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

    test('should not re-render the component for signals that were not read', () => {
      const tracked = createSignal('a');
      const untracked = createSignal('x');
      let renderCount = 0;

      function PartialTrackComponent(): ReactElement {
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

    test('should re-render once per batched signal update cycle', () => {
      const signalA = createSignal(0);
      const signalB = createSignal(0);
      let renderCount = 0;

      function BatchedComponent(): ReactElement {
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
    test('should not re-render after unmount when a tracked signal changes', () => {
      vi.useFakeTimers();
      try {
        const signal = createSignal('initial');
        let renderCount = 0;

        function TrackedComponent(): ReactElement {
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

    test('should keep subscriptions alive across StrictMode effect re-runs', () => {
      const signal = createSignal(0);

      function TrackedComponent(): ReactElement {
        useSignals();
        return <span data-testid="value">{signal.value}</span>;
      }

      // StrictMode mounts → unmounts → re-mounts the component in dev mode,
      // which schedules and then cancels the cleanup timeout. The signal
      // subscription must survive that cycle.
      render(
        <StrictMode>
          <TrackedComponent />
        </StrictMode>
      );

      act(() => {
        signal.value = 7;
      });

      expect(screen.getByTestId('value')).toHaveTextContent('7');
    });
  });

  describe('multiple components', () => {
    test('should only re-render components that read the changed signal', () => {
      const signalA = createSignal(0);
      const signalB = createSignal(0);
      let renderCountA = 0;
      let renderCountB = 0;

      function CounterA(): ReactElement {
        useSignals();
        renderCountA++;
        return <span data-testid="a">{signalA.value}</span>;
      }

      function CounterB(): ReactElement {
        useSignals();
        renderCountB++;
        return <span data-testid="b">{signalB.value}</span>;
      }

      render(
        <>
          <CounterA />
          <CounterB />
        </>
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
    test('should update signals and useState independently in the same component', () => {
      const signal = createSignal('signal-initial');

      function StateComponent(): ReactElement {
        useSignals();
        const [count, setCount] = useState(0);
        return (
          <div>
            <span data-testid="count">{count}</span>
            <span data-testid="signal">{signal.value}</span>
            <button onClick={() => setCount((c) => c + 1)}>Increment</button>
          </div>
        );
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
