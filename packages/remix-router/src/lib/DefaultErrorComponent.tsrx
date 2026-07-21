// DefaultErrorComponent — port of react-router@8.2.0 lib/hooks.tsx's default
// error UI. Markup-identical (differential fixtures still avoid it — the dev
// stack trace can never byte-match across runtimes).
import { useContext } from 'octane';
import { RouteErrorContext } from './context.ts';
import { ENABLE_DEV_WARNINGS, isRouteErrorResponse } from './router/utils.ts';

export function DefaultErrorComponent() @{
	const error = useContext(RouteErrorContext);
	const message =
		isRouteErrorResponse(error)
			? error.status + ' ' + error.statusText
			: error instanceof Error
				? error.message
				: JSON.stringify(error);
	const stack =
		error instanceof Error ? error.stack : null;
	const lightgrey = 'rgba(200,200,200, 0.5)';

	if (ENABLE_DEV_WARNINGS) {
		console.error('Error handled by React Router default ErrorBoundary:', error);
	}

	<>
		<h2>Unexpected Application Error!</h2>
		<h3 style={{ fontStyle: 'italic' }}>{message as string}</h3>
		@if (stack) {
			<pre style={{ padding: '0.5rem', backgroundColor: lightgrey }}>{stack as string}</pre>
		}
		@if (ENABLE_DEV_WARNINGS) {
			<>
				<p>💿 Hey developer 👋</p>
				<p>
					{'You can provide a way better UX than this when your app throws errors by providing your own '}
					<code style={{ padding: '2px 4px', backgroundColor: lightgrey }}>ErrorBoundary</code>
					{' or '}
					<code style={{ padding: '2px 4px', backgroundColor: lightgrey }}>errorElement</code>
					{' prop on your route.'}
				</p>
			</>
		}
	</>
}
