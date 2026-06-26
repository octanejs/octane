// Per-route Suspense fallbacks (skeletons) + the error fallback. Wired into the
// shared router via routes.ts; the router's <Match> renders a route's
// pendingComponent while that route's useSuspenseQuery is loading.
import * as stylex from '@octane-ts/stylex';
import { styles } from '../shared/styles.ts';

export function StoriesPending() @{
	<div data-testid="pending" {...stylex.props(styles.skeleton)}>{'Loading stories…'}</div>
}

export function ItemPending() @{
	<div data-testid="pending" {...stylex.props(styles.skeleton)}>{'Loading item…'}</div>
}

export function UserPending() @{
	<div data-testid="pending" {...stylex.props(styles.skeleton)}>{'Loading user…'}</div>
}

export function ErrorFallback({ error }: { error: unknown }) @{
	const message =
		error instanceof Error ? error.message : String(error);
	<div data-testid="error" {...stylex.props(styles.error)}>
		{'Something went wrong: ' + message as string}
	</div>
}
