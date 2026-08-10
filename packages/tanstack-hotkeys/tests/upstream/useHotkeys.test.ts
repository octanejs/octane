// Ported from @tanstack/react-hotkeys@0.10.0 packages/react-hotkeys/tests/useHotkeys.test.tsx
// (React Testing Library → @octanejs/testing-library, react → octane).
import { act, renderHook } from '@octanejs/testing-library';
import { HotkeyManager } from '@tanstack/hotkeys';
import { useState } from 'octane';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHotkeys } from '@octanejs/tanstack-hotkeys';
import type { UseHotkeyDefinition } from '@octanejs/tanstack-hotkeys';

describe('useHotkeys', () => {
	beforeEach(() => {
		HotkeyManager.resetInstance();
	});

	afterEach(() => {
		HotkeyManager.resetInstance();
	});

	// @parity-case adapted:upstream-usehotkeys:should-register-multiple-hotkey-handlers
	it('should register multiple hotkey handlers', () => {
		const saveCb = vi.fn();
		const undoCb = vi.fn();

		renderHook(() =>
			useHotkeys([
				{ hotkey: 'Mod+S', callback: saveCb, options: { platform: 'mac' } },
				{ hotkey: 'Mod+Z', callback: undoCb, options: { platform: 'mac' } },
			]),
		);

		const manager = HotkeyManager.getInstance();
		expect(manager.getRegistrationCount()).toBe(2);
	});

	// @parity-case adapted:upstream-usehotkeys:should-call-the-correct-callback-for-each-hotkey
	it('should call the correct callback for each hotkey', () => {
		const saveCb = vi.fn();
		const undoCb = vi.fn();

		renderHook(() =>
			useHotkeys(
				[
					{ hotkey: 'Mod+S', callback: saveCb },
					{ hotkey: 'Mod+Z', callback: undoCb },
				],
				{ platform: 'mac' },
			),
		);

		document.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 's',
				metaKey: true,
				bubbles: true,
			}),
		);
		expect(saveCb).toHaveBeenCalledTimes(1);
		expect(undoCb).not.toHaveBeenCalled();

		document.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'z',
				metaKey: true,
				bubbles: true,
			}),
		);
		expect(saveCb).toHaveBeenCalledTimes(1);
		expect(undoCb).toHaveBeenCalledTimes(1);
	});

	// @parity-case adapted:upstream-usehotkeys:should-unregister-all-hotkeys-on-unmount
	it('should unregister all hotkeys on unmount', () => {
		const saveCb = vi.fn();
		const undoCb = vi.fn();

		const { unmount } = renderHook(() =>
			useHotkeys(
				[
					{ hotkey: 'Mod+S', callback: saveCb },
					{ hotkey: 'Mod+Z', callback: undoCb },
				],
				{ platform: 'mac' },
			),
		);

		const manager = HotkeyManager.getInstance();
		expect(manager.getRegistrationCount()).toBe(2);

		unmount();
		expect(manager.getRegistrationCount()).toBe(0);
	});

	// @parity-case adapted:upstream-usehotkeys:should-handle-an-empty-array-as-a-no-op
	it('should handle an empty array as a no-op', () => {
		renderHook(() => useHotkeys([]));

		const manager = HotkeyManager.getInstance();
		expect(manager.getRegistrationCount()).toBe(0);
	});

	// @parity-case adapted:upstream-usehotkeys:should-handle-dynamic-array-changes-add-hotkey-
	it('should handle dynamic array changes (add hotkey)', () => {
		const saveCb = vi.fn();
		const undoCb = vi.fn();
		const escapeCb = vi.fn();

		const { rerender } = renderHook(
			({ defs }: { defs: Array<{ hotkey: string; callback: () => void }> }) =>
				useHotkeys(
					defs.map(
						(d) =>
							({
								hotkey: d.hotkey,
								callback: d.callback,
							}) as UseHotkeyDefinition,
					),
					{ platform: 'mac' },
				),
			{
				initialProps: {
					defs: [
						{ hotkey: 'Mod+S', callback: saveCb },
						{ hotkey: 'Mod+Z', callback: undoCb },
					],
				},
			},
		);

		const manager = HotkeyManager.getInstance();
		expect(manager.getRegistrationCount()).toBe(2);

		rerender({
			defs: [
				{ hotkey: 'Mod+S', callback: saveCb },
				{ hotkey: 'Mod+Z', callback: undoCb },
				{ hotkey: 'Escape', callback: escapeCb },
			],
		});

		expect(manager.getRegistrationCount()).toBe(3);

		document.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Escape',
				bubbles: true,
			}),
		);
		expect(escapeCb).toHaveBeenCalledTimes(1);
	});

	// @parity-case adapted:upstream-usehotkeys:should-handle-dynamic-array-changes-remove-hotkey-
	it('should handle dynamic array changes (remove hotkey)', () => {
		const saveCb = vi.fn();
		const undoCb = vi.fn();

		const { rerender } = renderHook(
			({ defs }: { defs: Array<{ hotkey: string; callback: () => void }> }) =>
				useHotkeys(
					defs.map(
						(d) =>
							({
								hotkey: d.hotkey,
								callback: d.callback,
							}) as UseHotkeyDefinition,
					),
					{ platform: 'mac' },
				),
			{
				initialProps: {
					defs: [
						{ hotkey: 'Mod+S', callback: saveCb },
						{ hotkey: 'Mod+Z', callback: undoCb },
					],
				},
			},
		);

		const manager = HotkeyManager.getInstance();
		expect(manager.getRegistrationCount()).toBe(2);

		rerender({
			defs: [{ hotkey: 'Mod+S', callback: saveCb }],
		});

		expect(manager.getRegistrationCount()).toBe(1);

		// Removed hotkey should no longer fire
		document.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'z',
				metaKey: true,
				bubbles: true,
			}),
		);
		expect(undoCb).not.toHaveBeenCalled();
	});

	// @parity-case adapted:upstream-usehotkeys:should-merge-commonoptions-with-per-definition-options
	it('should merge commonOptions with per-definition options', () => {
		const enabledCb = vi.fn();
		const disabledCb = vi.fn();

		renderHook(() =>
			useHotkeys(
				[
					{ hotkey: 'Mod+S', callback: enabledCb },
					{
						hotkey: 'Mod+Z',
						callback: disabledCb,
						options: { enabled: false },
					},
				],
				{ platform: 'mac' },
			),
		);

		document.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 's',
				metaKey: true,
				bubbles: true,
			}),
		);
		document.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'z',
				metaKey: true,
				bubbles: true,
			}),
		);

		expect(enabledCb).toHaveBeenCalledTimes(1);
		expect(disabledCb).not.toHaveBeenCalled();

		const manager = HotkeyManager.getInstance();
		expect(manager.getRegistrationCount()).toBe(2);
		const disabledReg = [...manager.registrations.state.values()].find((r) => r.hotkey === 'Mod+Z');
		expect(disabledReg?.options.enabled).toBe(false);
	});

	// @parity-case adapted:upstream-usehotkeys:should-move-a-registration-when-only-the-target-changes
	it('should move a registration when only the target changes', () => {
		const callback = vi.fn();
		const targetA = document.createElement('div');
		const targetB = document.createElement('div');

		const { rerender } = renderHook(
			({ target }: { target: HTMLElement }) =>
				useHotkeys([{ hotkey: 'Mod+S', callback, options: { target } }], {
					platform: 'mac',
				}),
			{ initialProps: { target: targetA } },
		);

		targetA.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 's',
				metaKey: true,
				bubbles: true,
			}),
		);
		expect(callback).toHaveBeenCalledTimes(1);

		rerender({ target: targetB });
		expect(HotkeyManager.getInstance().getRegistrationCount()).toBe(1);

		targetA.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 's',
				metaKey: true,
				bubbles: true,
			}),
		);
		expect(callback).toHaveBeenCalledTimes(1);

		targetB.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 's',
				metaKey: true,
				bubbles: true,
			}),
		);
		expect(callback).toHaveBeenCalledTimes(2);
	});

	describe('stale closure prevention', () => {
		// @parity-case adapted:upstream-usehotkeys:should-have-access-to-latest-state-values-in-callbacks
		it('should have access to latest state values in callbacks', () => {
			const capturedValues: Array<number> = [];

			const { result, rerender } = renderHook(() => {
				const [count, setCount] = useState(0);

				useHotkeys(
					[
						{
							hotkey: 'Mod+S',
							callback: () => {
								capturedValues.push(count);
							},
						},
					],
					{ platform: 'mac' },
				);

				return { count, setCount };
			});

			document.dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 's',
					metaKey: true,
					bubbles: true,
				}),
			);
			expect(capturedValues).toEqual([0]);

			act(() => {
				result.current.setCount(5);
			});
			rerender();

			document.dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 's',
					metaKey: true,
					bubbles: true,
				}),
			);
			expect(capturedValues).toEqual([0, 5]);

			act(() => {
				result.current.setCount(10);
			});
			rerender();

			document.dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 's',
					metaKey: true,
					bubbles: true,
				}),
			);
			expect(capturedValues).toEqual([0, 5, 10]);
		});

		// @parity-case adapted:upstream-usehotkeys:should-sync-enabled-option-on-every-render
		it('should sync enabled option on every render', () => {
			const callback = vi.fn();

			const { rerender } = renderHook(
				({ enabled }: { enabled: boolean }) =>
					useHotkeys([{ hotkey: 'Mod+S', callback, options: { enabled } }], {
						platform: 'mac',
					}),
				{ initialProps: { enabled: true } },
			);

			document.dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 's',
					metaKey: true,
					bubbles: true,
				}),
			);
			expect(callback).toHaveBeenCalledTimes(1);

			rerender({ enabled: false });

			document.dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 's',
					metaKey: true,
					bubbles: true,
				}),
			);
			expect(callback).toHaveBeenCalledTimes(1);

			rerender({ enabled: true });

			document.dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 's',
					metaKey: true,
					bubbles: true,
				}),
			);
			expect(callback).toHaveBeenCalledTimes(2);
		});

		// @parity-case adapted:upstream-usehotkeys:should-preserve-registration-id-when-toggling-enabled
		it('should preserve registration id when toggling enabled', () => {
			const callback = vi.fn();
			const manager = HotkeyManager.getInstance();

			const { rerender } = renderHook(
				({ enabled }: { enabled: boolean }) =>
					useHotkeys([{ hotkey: 'Mod+S', callback, options: { enabled } }], {
						platform: 'mac',
					}),
				{ initialProps: { enabled: true } },
			);

			const idBefore = [...manager.registrations.state.keys()][0];
			expect(manager.getRegistrationCount()).toBe(1);

			rerender({ enabled: false });
			expect(manager.getRegistrationCount()).toBe(1);
			expect([...manager.registrations.state.keys()][0]).toBe(idBefore);

			rerender({ enabled: true });
			expect([...manager.registrations.state.keys()][0]).toBe(idBefore);
		});
	});
});
