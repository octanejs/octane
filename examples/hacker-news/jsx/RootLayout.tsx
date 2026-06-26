import * as stylex from '@octane-ts/stylex';
import { Outlet, Link, useRouterState } from '@octane-ts/router';
import { ErrorBoundary } from 'octane';
import { styles } from '../shared/styles.ts';
import { ErrorFallback } from './Pending.tsx';

export function RootLayout() {
	// Navigation is concurrent (the router drives startTransition), so `isLoading`
	// is true while the next route's query loads — render a thin top progress bar.
	const isLoading = useRouterState({ select: (s) => s.isLoading });

	return (
		<div {...stylex.props(styles.app)}>
			{isLoading && <div data-testid="progress" {...stylex.props(styles.progress)} />}
			<header {...stylex.props(styles.header)}>
				<Link to="/" {...stylex.props(styles.logo)}>
					Y
				</Link>
				<Link to="/" {...stylex.props(styles.headerLink)}>
					Hacker News
				</Link>
			</header>
			<main {...stylex.props(styles.main)}>
				<ErrorBoundary fallback={(error) => <ErrorFallback error={error} />}>
					<Outlet />
				</ErrorBoundary>
			</main>
		</div>
	);
}
