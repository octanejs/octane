import { create } from '@octanejs/zustand/universal';
import { subscribeWithSelector } from '@octanejs/zustand/middleware';
import { createContext, type OctaneNode, useContext, useEffect, useMemo } from 'octane';
import type {
	KeyboardControlsApi,
	KeyboardControlsState,
	UseKeyboardControls,
} from './keyboard-controls-types.js';

export type KeyboardControlsEntry<T extends string = string> = {
	name: T;
	keys: string[];
	up?: boolean;
};

export type KeyboardControlsProps = {
	map: KeyboardControlsEntry[];
	children: OctaneNode;
	onChange?: (name: string, pressed: boolean, state: KeyboardControlsState) => void;
	domElement?: HTMLElement;
};

const KeyboardContext = createContext<KeyboardControlsApi>(null!);

export function KeyboardControls({ map, children, onChange, domElement }: KeyboardControlsProps) @{
	const key = map.map((item) => item.name + item.keys).join('-');
	const useControls = useMemo(
		() => create(
			subscribeWithSelector(
				() => map.reduce(
					(previous, current) => ({ ...previous, [current.name]: false }),
					{} as KeyboardControlsState,
				),
			),
		),
		[key],
	);
	const api = useMemo<KeyboardControlsApi>(
		() => [useControls.subscribe, useControls.getState, useControls],
		[key],
	);
	const set = useControls.setState;
	useEffect(() => {
		const config = map.map(
			({ name, keys, up }) => ({
				keys,
				up,
				fn: (value: boolean) => {
					set({ [name]: value });
					onChange?.(name, value, api[1]());
				},
			}),
		);
		const keyMap = config.reduce<
			Record<string, { fn(value: boolean): void; pressed: boolean; up: boolean }>
		>((output, { keys, fn, up = true }) => {
			keys.forEach((value) => (output[value] = { fn, pressed: false, up }));
			return output;
		}, {});
		const downHandler = ({ key: value, code }: KeyboardEvent) => {
			const object = keyMap[value] || keyMap[code];
			if (!object) return;
			const { fn, pressed, up } = object;
			object.pressed = true;
			if (up || !pressed) fn(true);
		};
		const upHandler = ({ key: value, code }: KeyboardEvent) => {
			const object = keyMap[value] || keyMap[code];
			if (!object) return;
			const { fn, up } = object;
			object.pressed = false;
			if (up) fn(false);
		};
		const source = domElement || window;
		source.addEventListener('keydown', downHandler as EventListener, { passive: true });
		source.addEventListener('keyup', upHandler as EventListener, { passive: true });
		return () => {
			source.removeEventListener('keydown', downHandler as EventListener);
			source.removeEventListener('keyup', upHandler as EventListener);
		};
	}, [domElement, key]);
	<KeyboardContext.Provider value={api}>{children}</KeyboardContext.Provider>
}

type Selector<T extends string = string> = (state: KeyboardControlsState<T>) => boolean;

export const useKeyboardControls: UseKeyboardControls = (
	...rest: [selector?: Selector | symbol, slot?: symbol]
) => {
	const [subscribe, get, store] = useContext(KeyboardContext);
	const tail = rest.at(-1);
	const slot =
		typeof tail === 'symbol' ? tail : undefined;
	const selector =
		typeof rest[0] === 'function' ? rest[0] : undefined;
	if (selector) return (store as any)(selector, slot);
	return [subscribe, get];
};
