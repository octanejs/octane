import * as stylex from '@octanejs/stylex';
import { Outlet, Link, useRouterState } from '@octanejs/tanstack-router';
import { ErrorBoundary } from 'octane';
import { styles } from '../shared/styles.js';
import { ErrorFallback } from './Pending.js';

export function RootLayout() {
	// Navigation is concurrent (the router drives startTransition), so `isLoading`
	// is true while the next route's query loads — render a thin top progress bar.
	const isLoading = useRouterState({ select: (s) => s.isLoading });
	// The active pathname drives which feed link is highlighted.
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	return (
		<div {...stylex.props(styles.app)}>
			{isLoading && <div data-testid="progress" {...stylex.props(styles.progress)} />}
			<header {...stylex.props(styles.header)}>
				<Link to="/" data-testid="nav-logo" {...stylex.props(styles.logoBox)}>
					Y
				</Link>
				<Link to="/" data-testid="nav-home" {...stylex.props(styles.logo)}>
					Hacker News
				</Link>
				<Link
					to="/newest"
					data-testid="nav-new"
					{...stylex.props(pathname === '/newest' ? styles.headerLinkActive : styles.headerLink)}
				>
					new
				</Link>
				<span {...stylex.props(styles.headerSep)}>|</span>
				<Link
					to="/ask"
					data-testid="nav-ask"
					{...stylex.props(pathname === '/ask' ? styles.headerLinkActive : styles.headerLink)}
				>
					ask
				</Link>
				<span {...stylex.props(styles.headerSep)}>|</span>
				<Link
					to="/show"
					data-testid="nav-show"
					{...stylex.props(pathname === '/show' ? styles.headerLinkActive : styles.headerLink)}
				>
					show
				</Link>
				<span {...stylex.props(styles.headerSep)}>|</span>
				<Link
					to="/jobs"
					data-testid="nav-jobs"
					{...stylex.props(pathname === '/jobs' ? styles.headerLinkActive : styles.headerLink)}
				>
					jobs
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
