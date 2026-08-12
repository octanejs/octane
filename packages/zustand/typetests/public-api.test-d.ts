import { create, createStore, useStore, type UseBoundStore } from '@octanejs/zustand';
import { createWithEqualityFn, useStoreWithEqualityFn } from '@octanejs/zustand/traditional';

type State = { count: number; increment(): void };
const initializer = (set: (partial: Partial<State>) => void): State => ({
	count: 0,
	increment: () => set({ count: 1 }),
});

const store = createStore<State>()(initializer);
const bound: UseBoundStore<typeof store> = create<State>()(initializer);
const count: number = useStore(store, (state) => state.count);
const traditional = createWithEqualityFn<State>()(initializer, Object.is);
const equalCount: number = useStoreWithEqualityFn(store, (state) => state.count, Object.is);
void [bound, count, traditional, equalCount];

// @ts-expect-error selector result is a number
const invalid: string = useStore(store, (state) => state.count);
void invalid;
