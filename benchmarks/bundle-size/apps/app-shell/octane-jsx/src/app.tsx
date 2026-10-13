/** @jsxImportSource octane */
import { lazy, startTransition, Suspense, useCallback, ViewTransition } from 'octane';
import { useSignal$ } from 'octane/signals/client';

const Page = lazy(() => import('./page'));

const fallback = <p>Loading…</p>;

export const App = () => {
	const count$ = useSignal$(0);
	const increment = useCallback(
		() => startTransition(() => count$.set(count$.get() + 1)),
		[count$],
	);
	return (
		<Suspense fallback={fallback}>
			<ViewTransition>
				<button type="button" onClick={increment}>
					{count$.get()}
				</button>
			</ViewTransition>
			<Page />
		</Suspense>
	);
};
