import { effect, signal } from 'alien-signals';
import {
	lazy,
	startTransition,
	Suspense,
	useCallback,
	useSyncExternalStore,
	ViewTransition,
} from 'react';

const Page = lazy(() => import('./page'));

const fallback = <p>Loading…</p>;

const count = signal(0);
const getCount = () => count();
const subscribe = (onChange: () => void) =>
	effect(() => {
		count();
		onChange();
	});

export const App = () => {
	const value = useSyncExternalStore(subscribe, getCount);
	const increment = useCallback(() => startTransition(() => count(count() + 1)), []);
	return (
		<Suspense fallback={fallback}>
			<ViewTransition>
				<button type="button" onClick={increment}>
					{value}
				</button>
			</ViewTransition>
			<Page />
		</Suspense>
	);
};
