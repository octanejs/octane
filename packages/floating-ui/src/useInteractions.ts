// Ported from @floating-ui/react useInteractions + mergeProps. mergeProps is pure
// JS (composes prop getters, chaining `on*` handlers so none overwrite another).
import { useCallback, useMemo } from 'octane';

import { splitSlot, subSlot } from './internal';
import { FOCUSABLE_ATTRIBUTE } from './utils';

const ACTIVE_KEY = 'active';
const SELECTED_KEY = 'selected';

function mergeProps(userProps: any, propsList: any[], elementKey: string): any {
	const map = new Map<string, any[]>();
	const isItem = elementKey === 'item';
	let domUserProps = userProps;
	if (isItem && userProps) {
		const { [ACTIVE_KEY]: _a, [SELECTED_KEY]: _s, ...validProps } = userProps;
		domUserProps = validProps;
	}
	return {
		...(elementKey === 'floating' && {
			tabIndex: -1,
			[FOCUSABLE_ATTRIBUTE]: '',
		}),
		...domUserProps,
		...propsList
			.map((value) => {
				const propsOrGetProps = value ? value[elementKey] : null;
				if (typeof propsOrGetProps === 'function') {
					return userProps ? propsOrGetProps(userProps) : null;
				}
				return propsOrGetProps;
			})
			.concat(userProps)
			.reduce((acc: any, props: any) => {
				if (!props) {
					return acc;
				}
				Object.entries(props).forEach((_ref) => {
					const [key, value] = _ref as [string, any];
					if (isItem && [ACTIVE_KEY, SELECTED_KEY].includes(key)) {
						return;
					}
					if (key.indexOf('on') === 0) {
						if (!map.has(key)) {
							map.set(key, []);
						}
						if (typeof value === 'function') {
							map.get(key)?.push(value);
							acc[key] = function (...args: any[]) {
								return map
									.get(key)
									?.map((fn) => fn(...args))
									.find((val) => val !== undefined);
							};
						}
					} else {
						acc[key] = value;
					}
				});
				return acc;
			}, {}),
	};
}

export function useInteractions(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const propsList = (user[0] as any[]) ?? [];

	const referenceDeps = propsList.map((key) => (key == null ? undefined : key.reference));
	const floatingDeps = propsList.map((key) => (key == null ? undefined : key.floating));
	const itemDeps = propsList.map((key) => (key == null ? undefined : key.item));

	const getReferenceProps = useCallback(
		(userProps: any) => mergeProps(userProps, propsList, 'reference'),
		referenceDeps,
		subSlot(slot, 'ref'),
	);
	const getFloatingProps = useCallback(
		(userProps: any) => mergeProps(userProps, propsList, 'floating'),
		floatingDeps,
		subSlot(slot, 'flo'),
	);
	const getItemProps = useCallback(
		(userProps: any) => mergeProps(userProps, propsList, 'item'),
		itemDeps,
		subSlot(slot, 'item'),
	);

	return useMemo(
		() => ({ getReferenceProps, getFloatingProps, getItemProps }),
		[getReferenceProps, getFloatingProps, getItemProps],
		subSlot(slot, 'ret'),
	);
}
