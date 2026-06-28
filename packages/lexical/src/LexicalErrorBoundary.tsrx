// Ported from @lexical/react/src/LexicalErrorBoundary.tsx. React's class-based
// boundary becomes octane's <ErrorBoundary> primitive. octane's ErrorBoundary has
// no `onError` prop, so we route it through the fallback render-prop (invoked with
// the caught error) — preserving the (error, info) callback Rich/PlainTextPlugin
// pass for decorator-render failures.
import { ErrorBoundary } from 'octane';

export function LexicalErrorBoundary(props) @{
	<ErrorBoundary
		fallback={(error, _reset) => {
			if (props.onError) {
				props.onError(error instanceof Error ? error : new Error(String(error), { cause: error }), {
					componentStack: '',
				});
			}
			return props.fallback === undefined
				? <div style={{ border: '1px solid #f00', color: '#f00', padding: '8px' }}>
						An error was thrown.
					</div>
				: (props.fallback);
		}}
	>{props.children}</ErrorBoundary>
}
