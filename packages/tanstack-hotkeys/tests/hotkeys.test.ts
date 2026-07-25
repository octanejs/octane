import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	HotkeyManager as CoreHotkeyManager,
	SequenceManager as CoreSequenceManager,
	normalizeRegisterableHotkey as normalizeCoreHotkey,
} from '@tanstack/hotkeys';
import {
	HotkeyManager,
	SequenceManager,
	normalizeRegisterableHotkey,
} from '@octanejs/tanstack-hotkeys';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import {
	DisabledProviderProbe,
	MultipleShortcutsProbe,
	SequenceProbe,
	ShortcutProbe,
} from './_fixtures/hotkeys.tsrx';

function pressKey(key: string, options: KeyboardEventInit = {}): void {
	document.dispatchEvent(
		new KeyboardEvent('keydown', {
			key,
			code: `Key${key.toUpperCase()}`,
			bubbles: true,
			cancelable: true,
			...options,
		}),
	);
}

afterEach(() => {
	HotkeyManager.resetInstance();
	SequenceManager.resetInstance();
	document.body.replaceChildren();
});

describe('@octanejs/tanstack-hotkeys', () => {
	it('re-exports the real framework-independent TanStack Hotkeys core', () => {
		expect(HotkeyManager).toBe(CoreHotkeyManager);
		expect(SequenceManager).toBe(CoreSequenceManager);
		expect(normalizeRegisterableHotkey).toBe(normalizeCoreHotkey);
	});

	it('registers a keyboard shortcut against the real document', () => {
		const onShortcut = vi.fn();
		const result = mount(ShortcutProbe, { onShortcut });
		flushEffects();

		pressKey('k', { ctrlKey: true });

		expect(onShortcut).toHaveBeenCalledTimes(1);
		result.unmount();
	});

	it('updates the registered callback without retaining a stale closure', () => {
		const originalShortcut = vi.fn();
		const updatedShortcut = vi.fn();
		const result = mount(ShortcutProbe, { onShortcut: originalShortcut });
		flushEffects();

		result.update(ShortcutProbe, { onShortcut: updatedShortcut });
		pressKey('k', { ctrlKey: true });

		expect(originalShortcut).not.toHaveBeenCalled();
		expect(updatedShortcut).toHaveBeenCalledTimes(1);
		result.unmount();
	});

	it('enables an existing disabled shortcut without reauthoring its callback', () => {
		const onShortcut = vi.fn();
		const result = mount(ShortcutProbe, { onShortcut, enabled: false });
		flushEffects();

		pressKey('k', { ctrlKey: true });
		expect(onShortcut).not.toHaveBeenCalled();

		result.update(ShortcutProbe, { onShortcut, enabled: true });
		pressKey('k', { ctrlKey: true });

		expect(onShortcut).toHaveBeenCalledTimes(1);
		result.unmount();
	});

	it('independently registers every shortcut in a dynamic hotkey list', () => {
		const onFirst = vi.fn();
		const onSecond = vi.fn();
		const result = mount(MultipleShortcutsProbe, { onFirst, onSecond });
		flushEffects();

		pressKey('k', { ctrlKey: true });
		pressKey('l', { ctrlKey: true });

		expect(onFirst).toHaveBeenCalledTimes(1);
		expect(onSecond).toHaveBeenCalledTimes(1);
		result.unmount();
	});

	it('completes a real multi-key shortcut sequence', () => {
		const onShortcut = vi.fn();
		const result = mount(SequenceProbe, { onShortcut });
		flushEffects();

		pressKey('g');
		expect(onShortcut).not.toHaveBeenCalled();
		pressKey('g');

		expect(onShortcut).toHaveBeenCalledTimes(1);
		result.unmount();
	});

	it('applies disabled defaults from the Octane HotkeysProvider', () => {
		const onShortcut = vi.fn();
		const result = mount(DisabledProviderProbe, { onShortcut });
		flushEffects();

		pressKey('k', { ctrlKey: true });

		expect(onShortcut).not.toHaveBeenCalled();
		result.unmount();
	});

	it('unregisters document listeners when its component unmounts', () => {
		const onShortcut = vi.fn();
		const result = mount(ShortcutProbe, { onShortcut });
		flushEffects();

		result.unmount();
		flushEffects();
		expect(HotkeyManager.getInstance().registrations.state.size).toBe(0);
		pressKey('k', { ctrlKey: true });

		expect(onShortcut).not.toHaveBeenCalled();
	});
});
