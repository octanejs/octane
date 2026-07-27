import { describe, expect, it } from 'vitest';
import * as binding from '@octanejs/tauri';

describe('@octanejs/tauri exports', () => {
	it('exposes the hook surface and the host error', () => {
		expect(binding.useInvoke).toBeTypeOf('function');
		expect(binding.useInvokeState).toBeTypeOf('function');
		expect(binding.useTauriEvent).toBeTypeOf('function');
		expect(binding.TauriUnavailableError.prototype).toBeInstanceOf(Error);
	});

	it('leaves the @tauri-apps/api runtime surface to its own package', () => {
		const runtimeExports = Object.keys(binding).sort();
		expect(runtimeExports).toEqual([
			'TauriUnavailableError',
			'useInvoke',
			'useInvokeState',
			'useTauriEvent',
		]);
	});
});
