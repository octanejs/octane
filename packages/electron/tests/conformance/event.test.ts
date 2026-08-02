import { afterEach, describe, expect, it } from 'vitest';
import type { OctaneElectronAPI } from '../../src/common/types';
import { installElectronBridge } from '../../src/renderer/internal';
import { EventBoundary, ReportingEventReader } from '../_fixtures/commands.tsrx';
import { act, flush, installMockBridge, mount, resetBridge } from '../_helpers';

afterEach(async () => {
	await flush();
	resetBridge();
});

describe('useIpcEvent', () => {
	it('delivers payloads and tears down on unmount', async () => {
		const ticks: string[] = [];
		const { emit } = installMockBridge(() => null);
		const result = mount(EventBoundary, {
			event: 'tick',
			onTick: (value: string) => ticks.push(value),
		});
		await flush();

		await act(() => {
			emit('tick', 'a');
		});
		expect(ticks).toEqual(['a']);

		result.unmount();
		await flush();
		await act(() => {
			emit('tick', 'b');
		});
		expect(ticks).toEqual(['a']);
	});

	it('throws ElectronUnavailableError without a bridge', async () => {
		const result = mount(EventBoundary, {
			event: 'tick',
			onTick: () => {},
		});
		await flush();
		expect(result.find('#caught').textContent).toBe('ElectronUnavailableError');
		result.unmount();
	});

	it('reports subscription failures through onError without unmounting', async () => {
		const failures: unknown[] = [];
		const { calls: _calls } = installMockBridge(() => null);
		void _calls;

		// Rebuild a bridge whose on() rejects the channel.
		const base = installMockBridge(() => null);
		void base;
		resetBridge();

		const api = {
			invoke: async () => null,
			on: (channel: string) => {
				if (channel === 'tick') throw new Error('denied');
				return () => {};
			},
			app: {} as OctaneElectronAPI['app'],
			window: {} as OctaneElectronAPI['window'],
			dialog: {} as OctaneElectronAPI['dialog'],
			shell: {} as OctaneElectronAPI['shell'],
			clipboard: {} as OctaneElectronAPI['clipboard'],
			nativeTheme: {} as OctaneElectronAPI['nativeTheme'],
			screen: {} as OctaneElectronAPI['screen'],
		} as OctaneElectronAPI;
		installElectronBridge(api);

		const result = mount(ReportingEventReader, {
			event: 'tick',
			onTick: () => {},
			onFailure: (error: unknown) => failures.push(error),
		});
		await flush();
		expect(result.find('#reader').textContent).toBe('ready');
		expect(failures).toHaveLength(1);
		result.unmount();
	});
});
