import { createStore } from '@octanejs/zustand/vanilla';

export function run(_container: HTMLElement) {
	const store = createStore<{ count: number }>(() => ({ count: 0 }));
	let notifications = 0;
	const unsubscribe = store.subscribe(() => {
		notifications++;
	});
	const before = store.getState().count;
	store.setState({ count: 1 });
	const after = store.getState().count;
	unsubscribe();
	return { before, after, notifications };
}
