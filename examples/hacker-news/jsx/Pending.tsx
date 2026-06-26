// Per-route Suspense fallbacks (skeletons) + the error fallback. Wired into the
// shared router via routes.ts; the router's <Match> renders a route's
// pendingComponent while that route's useSuspenseQuery is loading.
import * as stylex from '@octane-ts/stylex';
import { styles } from '../shared/styles.ts';

export function StoriesPending() {
	return (
		<div data-testid="pending" {...stylex.props(styles.skeleton)}>
			Loading stories…
		</div>
	);
}

export function ItemPending() {
	return (
		<div data-testid="pending" {...stylex.props(styles.skeleton)}>
			Loading item…
		</div>
	);
}

export function UserPending() {
	return (
		<div data-testid="pending" {...stylex.props(styles.skeleton)}>
			Loading user…
		</div>
	);
}

export function ErrorFallback({ error }: { error: unknown }) {
	const message = error instanceof Error ? error.message : String(error);
	return (
		<div data-testid="error" {...stylex.props(styles.error)}>
			Something went wrong: {message}
		</div>
	);
}
