// Per packages/signals-react/upstream/canonical/runtime/test/browser/useSignals.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@octanejs/testing-library';
import { createElement as h } from 'octane';
import { signal } from '@preact/signals-core';
import type { EffectStore } from '../src/runtime/index.ts';
import {
	ExternalSignalText,
	UseComputedDouble,
	UseSignalCounter,
	UseSignalEffectLogger,
} from './_fixtures/hooks.tsrx';

afterEach(cleanup);

describe('useSignals', function useSignalsSuite() {
	it('should rerender components when signals they use change', function rerenderOnChange() {
		const count = signal(0);
		const view = render(h(ExternalSignalText, { count }));
		expect(view.container.querySelector('p')!.textContent).toBe('0');

		act(function bump() {
			count.value = 1;
		});
		expect(view.container.querySelector('p')!.textContent).toBe('1');
	});

	it('finishes unmanaged tracking after every committed render', function finishEveryRender() {
		const count = signal(0);
		let store: EffectStore | undefined;
		const view = render(
			h(ExternalSignalText, {
				count,
				onStore(nextStore) {
					store = nextStore;
				},
			}),
		);
		const finish = vi.spyOn(store!, 'f');

		view.rerender(h(ExternalSignalText, { count }));

		expect(finish).toHaveBeenCalledTimes(1);
	});
});

describe('useSignal', function useSignalSuite() {
	it('creates a stable signal and updates on write', function stableWrite() {
		const view = render(h(UseSignalCounter));
		const button = view.container.querySelector('button')!;
		expect(button.textContent).toBe('0');
		fireEvent.click(button);
		expect(button.textContent).toBe('1');
	});
});

describe('useComputed', function useComputedSuite() {
	it('recomputes when the source signal changes', function recomputes() {
		const count = signal(2);
		const view = render(h(UseComputedDouble, { count }));
		expect(view.container.querySelector('p')!.textContent).toBe('4');
		act(function bump() {
			count.value = 3;
		});
		expect(view.container.querySelector('p')!.textContent).toBe('6');
	});
});

describe('useSignalEffect', function useSignalEffectSuite() {
	it('runs when the watched signal changes', function runsOnChange() {
		const logs: string[] = [];
		const count = signal(0);
		render(h(UseSignalEffectLogger, { count, logs }));
		expect(logs).toEqual(['Count is 0']);
		act(function bump() {
			count.value = 1;
		});
		expect(logs).toEqual(['Count is 0', 'Count is 1']);
	});
});
