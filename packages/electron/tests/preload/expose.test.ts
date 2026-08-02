import { describe, expect, it, vi } from 'vitest';
import { OCTANE_ELECTRON_CHANNELS, OCTANE_ELECTRON_GLOBAL } from '../../src/common/channels';
import { createOctaneElectronAPI, exposeOctaneElectron } from '../../src/preload/index';

describe('createOctaneElectronAPI', () => {
	it('forwards invoke and strips event objects from on()', async () => {
		const invokes: Array<{ channel: string; args: unknown[] }> = [];
		const listeners = new Map<string, Array<(event: unknown, ...args: unknown[]) => void>>();

		const api = createOctaneElectronAPI({
			invoke: async (channel, ...args) => {
				invokes.push({ channel, args });
				return `ok:${channel}`;
			},
			on: (channel, listener) => {
				let list = listeners.get(channel);
				if (list === undefined) listeners.set(channel, (list = []));
				list.push(listener);
			},
			removeListener: (channel, listener) => {
				const list = listeners.get(channel);
				if (list === undefined) return;
				const index = list.indexOf(listener);
				if (index >= 0) list.splice(index, 1);
			},
		});

		await expect(api.app.getVersion()).resolves.toBe(
			`ok:${OCTANE_ELECTRON_CHANNELS.appGetVersion}`,
		);
		expect(invokes[0].channel).toBe(OCTANE_ELECTRON_CHANNELS.appGetVersion);

		const values: boolean[] = [];
		const stop = api.nativeTheme.onUpdated((dark) => values.push(dark));
		for (const listener of listeners.get(OCTANE_ELECTRON_CHANNELS.nativeThemeUpdated) ?? []) {
			listener({}, true);
		}
		expect(values).toEqual([true]);
		stop();
	});

	it('rejects disallowed invoke channels when allowlisted', async () => {
		const api = createOctaneElectronAPI(
			{
				invoke: async () => null,
				on: () => {},
				removeListener: () => {},
			},
			{ allowInvoke: ['safe'] },
		);
		await expect(api.invoke('safe')).resolves.toBeNull();
		await expect(api.invoke('unsafe')).rejects.toThrow(/not allowed/);
		await expect(api.invoke(OCTANE_ELECTRON_CHANNELS.appGetVersion)).resolves.toBeNull();
	});
});

describe('exposeOctaneElectron', () => {
	it('exposes through contextBridge', () => {
		const exposeInMainWorld = vi.fn();
		const api = exposeOctaneElectron({
			ipcRenderer: {
				invoke: async () => null,
				on: () => {},
				removeListener: () => {},
			},
			contextBridge: { exposeInMainWorld },
		});
		expect(exposeInMainWorld).toHaveBeenCalledWith(OCTANE_ELECTRON_GLOBAL, api);
	});

	it('honours a custom apiKey on the contextBridge', () => {
		const exposeInMainWorld = vi.fn();
		exposeOctaneElectron({
			apiKey: 'myElectronAPI',
			ipcRenderer: {
				invoke: async () => null,
				on: () => {},
				removeListener: () => {},
			},
			contextBridge: { exposeInMainWorld },
		});
		expect(exposeInMainWorld).toHaveBeenCalledWith('myElectronAPI', expect.any(Object));
	});
});
