import { lazy, startTransition, useCallback, ViewTransition } from 'octane';
import { useSignal$ } from 'octane/signals/client';

const Page = lazy(() => import('./page.tsrx'));

export function App() @{
	const count$ = useSignal$(0);
	const increment = useCallback(
		() => startTransition(() => count$.set(count$.get() + 1)),
		[count$],
	);
	<>
		@try {
			<>
				<ViewTransition>
					<button type="button" onClick={increment}>
						{String(count$.get())}
					</button>
				</ViewTransition>
				<Page />
			</>
		} @pending {
			<p>Loading…</p>
		}
	</>
}
