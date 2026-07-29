import { useEffect, useEffectEvent } from 'octane';
import { getHotkeyHandler, getHotkeyMatcher } from './parse-hotkey';
import type { HotkeyItemOptions } from './parse-hotkey';

export type { HotkeyItemOptions };
export { getHotkeyHandler };

export type HotkeyItem = [string, (event: KeyboardEvent) => void, HotkeyItemOptions?];

function withoutSlot<T>(value: T | symbol): T | undefined {
	return typeof value === 'symbol' ? undefined : value;
}

function shouldFireEvent(
	event: KeyboardEvent,
	tagsToIgnore: string[],
	triggerOnContentEditable = false,
) {
	if (event.target instanceof HTMLElement) {
		if (triggerOnContentEditable) {
			return !tagsToIgnore.includes(event.target.tagName);
		}

		return !event.target.isContentEditable && !tagsToIgnore.includes(event.target.tagName);
	}

	return true;
}

export function useHotkeys(
	hotkeys: HotkeyItem[],
	tagsToIgnore: string[] = ['INPUT', 'TEXTAREA', 'SELECT'],
	triggerOnContentEditable = false,
) {
	const ignoredTags = withoutSlot(tagsToIgnore) ?? ['INPUT', 'TEXTAREA', 'SELECT'];
	const allowContentEditable = withoutSlot(triggerOnContentEditable) ?? false;

	const handleKeydown = useEffectEvent((event: KeyboardEvent) => {
		hotkeys.forEach(
			([hotkey, handler, options = { preventDefault: true, usePhysicalKeys: false }]) => {
				if (
					getHotkeyMatcher(hotkey, options.usePhysicalKeys)(event) &&
					shouldFireEvent(event, ignoredTags, allowContentEditable)
				) {
					if (options.preventDefault) {
						event.preventDefault();
					}

					handler(event);
				}
			},
		);
	});

	useEffect(() => {
		document.documentElement.addEventListener('keydown', handleKeydown);
		return () => document.documentElement.removeEventListener('keydown', handleKeydown);
	}, []);
}

export namespace useHotkeys {
	export type Hotkey = HotkeyItem;
}
