import { describe, expect, it } from 'vitest';
import * as binding from '@octanejs/electron';

describe('@octanejs/electron exports', () => {
	it('exposes the renderer hook and desktop surface', () => {
		expect(binding.useInvoke).toBeTypeOf('function');
		expect(binding.useInvokeState).toBeTypeOf('function');
		expect(binding.useIpcEvent).toBeTypeOf('function');
		expect(binding.useNativeTheme).toBeTypeOf('function');
		expect(binding.useWindowState).toBeTypeOf('function');
		expect(binding.ElectronUnavailableError.prototype).toBeInstanceOf(Error);
		expect(binding.app.getVersion).toBeTypeOf('function');
		expect(binding.shell.openExternal).toBeTypeOf('function');
	});

	it('locks the public renderer runtime export set', () => {
		expect(Object.keys(binding).sort()).toEqual([
			'ElectronUnavailableError',
			'OCTANE_ELECTRON_CHANNELS',
			'OCTANE_ELECTRON_GLOBAL',
			'app',
			'clearElectronBridge',
			'clipboard',
			'dialog',
			'getElectronBridgeKey',
			'hasElectronHost',
			'installElectronBridge',
			'screen',
			'setElectronBridgeKey',
			'shell',
			'useInvoke',
			'useInvokeState',
			'useIpcEvent',
			'useNativeTheme',
			'useWindowState',
			'windowControls',
		]);
	});
});
