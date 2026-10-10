export function isDelegatedEventProp(name: string): boolean;

export const EVENT_BUBBLE: 1;
export const EVENT_CAPTURE: 2;
export const EVENT_NATIVE_CAPTURE: 4;
export const EVENT_TARGET_ONLY: 8;
export const EVENT_DISCRETE: 16;
export const EVENT_RESTORE: 32;
export const EVENT_DISABLED_MOUSE: 64;
export const EVENT_DISABLED_ENTER: 128;
export const EVENT_CUSTOM_NATIVE_ONLY: 256;
export const RESTORE_EVENT_LIST: string[];
export function delegatedEventFlags(name: string): number;
