// Adapted from packages/zag/upstream/tests/render.ts (pin @zag-js/react@1.42.0).
import { act, renderHook } from '@octanejs/testing-library';
import { useMachine } from '@octanejs/zag';
import { vi } from 'vitest';

export function renderMachine(machine: any, props?: any) {
	const render = renderHook(() => useMachine<any>(machine, props));
	const send = async (event: any) => {
		await act(async () => render.result.current.send(event));
	};
	const advanceTime = async (ms: number) => {
		await act(async () => vi.advanceTimersByTime(ms));
	};
	return { ...render, send, advanceTime };
}
