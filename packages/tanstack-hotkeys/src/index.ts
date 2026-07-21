// Octane port of @tanstack/react-hotkeys@0.10.0 — thin hook wrappers over the
// framework-agnostic @tanstack/hotkeys core, mirroring the upstream module
// layout (src/index.ts).

// Re-export everything from the core package
export * from '@tanstack/hotkeys';

// provider
export { HotkeysProvider } from './HotkeysProvider.tsrx';
export type { HotkeysProviderProps } from './HotkeysProvider.tsrx';
export { useHotkeysContext, useDefaultHotkeysOptions } from './context';
export type { HotkeysProviderOptions } from './context';

// Octane-specific exports (upstream: "React-specific exports")
export * from './useHotkey';
export * from './useHotkeys';
export * from './useHeldKeys';
export * from './useHeldKeyCodes';
export * from './useKeyHold';
export * from './useHotkeySequence';
export * from './useHotkeySequences';
export * from './useHotkeyRecorder';
export * from './useHotkeyRegistrations';
export * from './useHotkeySequenceRecorder';
