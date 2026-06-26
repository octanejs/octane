// Per-route Suspense fallbacks (skeletons) + the error fallback. Wired into the
// shared router via routes.ts; the router's <Match> renders a route's
// pendingComponent while that route's useSuspenseQuery is loading.
import * as stylex from '@octane-ts/stylex';
import { styles } from '../shared/styles.js';
import { PAGE_SIZE } from '../shared/routes.js';

// A single placeholder story row (wide title bar + thin meta bar, gently
// pulsing). Stacked to build the route-level pending skeleton — one per row of a
// full page, so it maps to the rows that will load in.
export function RowSkeleton() @{
	<div data-testid="row-skeleton" {...stylex.props(styles.skeletonRow)}>
		<div {...stylex.props(styles.skeletonTitle)} />
		<div {...stylex.props(styles.skeletonMeta)} />
	</div>
}

function SkeletonList({ rows }: { rows: number }) @{
	const items = Array.from({ length: rows }, (_, i) => i);

	<div data-testid="pending">
		@for (const i of items; key i) {
			<RowSkeleton />
		}
	</div>
}

export function StoriesPending() @{
	<SkeletonList rows={PAGE_SIZE} />
}

export function ItemPending() @{
	<SkeletonList rows={5} />
}

export function UserPending() @{
	<SkeletonList rows={3} />
}

export function ErrorFallback({ error }: { error: unknown }) @{
	const message =
		error instanceof Error ? error.message : String(error);
	<div data-testid="error" {...stylex.props(styles.error)}>
		{'Something went wrong: ' + message as string}
	</div>
}
