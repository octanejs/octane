import type { StoreApi, UseBoundStore } from '@octanejs/zustand/universal';

type State = object;
type StateSelector<T extends State, U> = (state: T) => U;
type EqualityChecker<T> = (state: T, nextState: T) => boolean;
type StateListener<T> = (state: T, previousState: T) => void;

export type StoreApiWithSubscribeWithSelector<T extends State> = Omit<StoreApi<T>, 'subscribe'> & {
	subscribe: {
		(listener: StateListener<T>): () => void;
		<StateSlice>(
			selector: StateSelector<T, StateSlice>,
			listener: StateListener<StateSlice>,
			options?: { equalityFn?: EqualityChecker<StateSlice>; fireImmediately?: boolean },
		): () => void;
	};
};

export type KeyboardControlsState<T extends string = string> = { [Key in T]: boolean };
export type KeyboardControlsApi<T extends string = string> = [
	StoreApiWithSubscribeWithSelector<KeyboardControlsState<T>>['subscribe'],
	StoreApiWithSubscribeWithSelector<KeyboardControlsState<T>>['getState'],
	UseBoundStore<StoreApi<KeyboardControlsState<T>>>,
];
type Selector<T extends string = string> = (state: KeyboardControlsState<T>) => boolean;

export interface UseKeyboardControls {
	<T extends string = string>(): [
		StoreApiWithSubscribeWithSelector<KeyboardControlsState<T>>['subscribe'],
		StoreApiWithSubscribeWithSelector<KeyboardControlsState<T>>['getState'],
	];
	<T extends string = string>(selector: Selector<T>): boolean;
}
