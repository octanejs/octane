import { getHotkeyHandler, HotkeyItemOptions } from './parse-hotkey';
export type { HotkeyItemOptions };
export { getHotkeyHandler };
export type HotkeyItem = [string, (event: KeyboardEvent) => void, HotkeyItemOptions?];
export declare function useHotkeys(hotkeys: HotkeyItem[], tagsToIgnore?: string[], triggerOnContentEditable?: boolean): void;
export declare namespace useHotkeys {
    type Hotkey = HotkeyItem;
}
