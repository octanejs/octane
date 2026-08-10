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
	ContextProbe,
	DisabledProviderProbe,
	HeldStateProbe,
	MultipleShortcutsProbe,
	RecorderProbe,
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

	it('completes a real multi-key shortcut sequence with useHotkeySequence', () => {
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

	it('exposes held-key state through useHeldKeys, useHeldKeyCodes, and useKeyHold', function () {
		const result = mount(HeldStateProbe);
		flushEffects();

		expect(result.container.querySelector('#held-keys')).not.toBeNull();
		expect(result.container.querySelector('#held-codes')).not.toBeNull();
		expect(result.container.querySelector('#shift-held')?.textContent).toBe('false');
		result.unmount();
		flushEffects();
	});

	it('records shortcuts through useHotkeyRecorder and useHotkeySequenceRecorder', function () {
		const onRecord = vi.fn();
		const onSequence = vi.fn();
		const result = mount(RecorderProbe, { onRecord, onSequence });
		flushEffects();

		const startHotkey = result.container.querySelector('#start-hotkey-recorder');
		const startSequence = result.container.querySelector('#start-sequence-recorder');
		expect(startHotkey).not.toBeNull();
		expect(startSequence).not.toBeNull();
		(startHotkey as HTMLButtonElement).click();
		(startSequence as HTMLButtonElement).click();
		flushEffects();

		expect(result.container.textContent).toContain('recording:true');
		expect(result.container.textContent).toContain('sequenceRecording:true');
		result.unmount();
		flushEffects();
	});

	it('surfaces HotkeysProvider defaults through useHotkeysContext and useDefaultHotkeysOptions', function () {
		const result = mount(ContextProbe);
		flushEffects();

		expect(result.container.querySelector('#has-context')?.textContent).toBe('true');
		expect(result.container.querySelector('#default-enabled')?.textContent).toBe('true');
		result.unmount();
	});
});
