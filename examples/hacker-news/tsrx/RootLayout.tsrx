import * as stylex from '@octane-ts/stylex';
import { Outlet, Link, useRouterState } from '@octane-ts/router';
import { ErrorBoundary } from 'octane';
import { styles } from '../shared/styles.js';
import { ErrorFallback } from './Pending.tsrx';

export function RootLayout() @{
	// Navigation is concurrent (the router drives startTransition), so `isLoading`
	// is true while the next route's query loads — render a thin top progress bar.
	const isLoading = useRouterState({ select: (s) => s.isLoading });

	<div {...stylex.props(styles.app)}>
		@if (isLoading) {
			<div data-testid="progress" {...stylex.props(styles.progress)} />
		}
		<header {...stylex.props(styles.header)}>
			<Link to="/" data-testid="nav-logo" {...stylex.props(styles.logoBox)}>{'Y'}</Link>
			<Link to="/" data-testid="nav-home" {...stylex.props(styles.logo)}>{'Hacker News'}</Link>
			<Link to="/" data-testid="nav-new" {...stylex.props(styles.headerLink)}>{'new'}</Link>
			<span {...stylex.props(styles.headerSep)}>{'|'}</span>
			<Link to="/" data-testid="nav-past" {...stylex.props(styles.headerLink)}>{'past'}</Link>
			<span {...stylex.props(styles.headerSep)}>{'|'}</span>
			<Link
				to="/"
				data-testid="nav-comments"
				{...stylex.props(styles.headerLink)}
			>{'comments'}</Link>
			<span {...stylex.props(styles.headerSep)}>{'|'}</span>
			<Link to="/" data-testid="nav-ask" {...stylex.props(styles.headerLink)}>{'ask'}</Link>
			<span {...stylex.props(styles.headerSep)}>{'|'}</span>
			<Link to="/" data-testid="nav-show" {...stylex.props(styles.headerLink)}>{'show'}</Link>
			<span {...stylex.props(styles.headerSep)}>{'|'}</span>
			<Link to="/" data-testid="nav-jobs" {...stylex.props(styles.headerLink)}>{'jobs'}</Link>
			<span {...stylex.props(styles.headerSep)}>{'|'}</span>
			<Link to="/" data-testid="nav-submit" {...stylex.props(styles.headerLink)}>{'submit'}</Link>
		</header>
		<main {...stylex.props(styles.main)}>
			<ErrorBoundary fallback={(error) => <ErrorFallback error={error} />}>
				<Outlet />
			</ErrorBoundary>
		</main>
	</div>
}
