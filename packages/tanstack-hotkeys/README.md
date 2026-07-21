# @octanejs/tanstack-hotkeys

Octane port of `@tanstack/react-hotkeys` — keyboard hotkeys, chord sequences,
held-key tracking, and shortcut recording. Re-exports the framework-agnostic
`@tanstack/hotkeys` core unchanged and implements the full hook surface
(`useHotkey`, `useHotkeys`, `useHeldKeys`, `useHeldKeyCodes`, `useKeyHold`,
`useHotkeySequence`, `useHotkeySequences`, `useHotkeyRecorder`,
`useHotkeySequenceRecorder`, `useHotkeyRegistrations`) plus `HotkeysProvider`
on Octane hooks, with store subscriptions via `@octanejs/tanstack-store`.
