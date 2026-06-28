// Ported from @floating-ui/react useTypeahead — type-to-select over a list. Native
// keyboard events (no event.nativeEvent usage here).
import { useMemo, useRef } from 'octane';

import { splitSlot, subSlot } from './internal';
import {
	clearTimeoutIfSet,
	stopEvent,
	useEffectEvent,
	useLatestRef,
	useModernLayoutEffect,
} from './utils';

export function useTypeahead(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const context = user[0];
	const props = (user[1] as any) ?? {};

	const open = context.open;
	const dataRef = context.dataRef;

	const listRef = props.listRef;
	const activeIndex = props.activeIndex;
	const unstableOnMatch = props.onMatch;
	const unstableOnTypingChange = props.onTypingChange;
	const enabled = props.enabled ?? true;
	const findMatch = props.findMatch ?? null;
	const resetMs = props.resetMs ?? 750;
	const ignoreKeys = props.ignoreKeys ?? [];
	const selectedIndex = props.selectedIndex ?? null;

	const timeoutIdRef = useRef(-1, subSlot(slot, 'timeout'));
	const stringRef = useRef('', subSlot(slot, 'string'));
	const prevIndexRef = useRef(
		(selectedIndex != null ? selectedIndex : activeIndex) ?? -1,
		subSlot(slot, 'prev'),
	);
	const matchIndexRef = useRef<any>(null, subSlot(slot, 'match'));

	const onMatch = useEffectEvent(unstableOnMatch, subSlot(slot, 'onmatch'));
	const onTypingChange = useEffectEvent(unstableOnTypingChange, subSlot(slot, 'ontyping'));
	const findMatchRef = useLatestRef(findMatch, subSlot(slot, 'find'));
	const ignoreKeysRef = useLatestRef(ignoreKeys, subSlot(slot, 'ignore'));

	useModernLayoutEffect(
		() => {
			if (open) {
				clearTimeoutIfSet(timeoutIdRef);
				matchIndexRef.current = null;
				stringRef.current = '';
			}
		},
		[open],
		subSlot(slot, 'e:open'),
	);

	useModernLayoutEffect(
		() => {
			if (open && stringRef.current === '') {
				prevIndexRef.current = (selectedIndex != null ? selectedIndex : activeIndex) ?? -1;
			}
		},
		[open, selectedIndex, activeIndex],
		subSlot(slot, 'e:sync'),
	);

	const setTypingChange = useEffectEvent(
		(value: any) => {
			if (value) {
				if (!dataRef.current.typing) {
					dataRef.current.typing = value;
					onTypingChange(value);
				}
			} else {
				if (dataRef.current.typing) {
					dataRef.current.typing = value;
					onTypingChange(value);
				}
			}
		},
		subSlot(slot, 'settyping'),
	);

	const onKeyDown = useEffectEvent(
		(event: any) => {
			function getMatchingIndex(list: any[], orderedList: any[], string: string) {
				const str = findMatchRef.current
					? findMatchRef.current(orderedList, string)
					: orderedList.find(
							(text: any) => text?.toLocaleLowerCase().indexOf(string.toLocaleLowerCase()) === 0,
						);
				return str ? list.indexOf(str) : -1;
			}
			const listContent = listRef.current;
			if (stringRef.current.length > 0 && stringRef.current[0] !== ' ') {
				if (getMatchingIndex(listContent, listContent, stringRef.current) === -1) {
					setTypingChange(false);
				} else if (event.key === ' ') {
					stopEvent(event);
				}
			}
			if (
				listContent == null ||
				ignoreKeysRef.current.includes(event.key) ||
				event.key.length !== 1 ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey
			) {
				return;
			}
			if (open && event.key !== ' ') {
				stopEvent(event);
				setTypingChange(true);
			}

			const allowRapidSuccessionOfFirstLetter = listContent.every((text: any) =>
				text ? text[0]?.toLocaleLowerCase() !== text[1]?.toLocaleLowerCase() : true,
			);

			if (allowRapidSuccessionOfFirstLetter && stringRef.current === event.key) {
				stringRef.current = '';
				prevIndexRef.current = matchIndexRef.current;
			}
			stringRef.current += event.key;
			clearTimeoutIfSet(timeoutIdRef);
			timeoutIdRef.current = window.setTimeout(() => {
				stringRef.current = '';
				prevIndexRef.current = matchIndexRef.current;
				setTypingChange(false);
			}, resetMs);
			const prevIndex = prevIndexRef.current;
			const index = getMatchingIndex(
				listContent,
				[...listContent.slice((prevIndex || 0) + 1), ...listContent.slice(0, (prevIndex || 0) + 1)],
				stringRef.current,
			);
			if (index !== -1) {
				onMatch(index);
				matchIndexRef.current = index;
			} else if (event.key !== ' ') {
				stringRef.current = '';
				setTypingChange(false);
			}
		},
		subSlot(slot, 'keydown'),
	);

	const reference = useMemo(() => ({ onKeyDown }), [onKeyDown], subSlot(slot, 'm:ref'));
	const floating = useMemo(
		() => ({
			onKeyDown,
			onKeyUp(event: any) {
				if (event.key === ' ') {
					setTypingChange(false);
				}
			},
		}),
		[onKeyDown, setTypingChange],
		subSlot(slot, 'm:flo'),
	);

	return useMemo(
		() => (enabled ? { reference, floating } : {}),
		[enabled, reference, floating],
		subSlot(slot, 'm:ret'),
	);
}
