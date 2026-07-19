// Ported from @lexical/react/src/LexicalErrorBoundary.tsx. React's class-based
// boundary becomes octane's <ErrorBoundary> primitive. octane's ErrorBoundary has
// no `onError` prop, so we route it through the fallback render-prop (invoked with
// the caught error) — preserving the (error, info) callback Rich/PlainTextPlugin
// pass for decorator-render failures.
import { ErrorBoundary } from 'octane';
import type { OctaneNode } from 'octane';

// Octane analog of React's `ErrorInfo`.
type ErrorInfo = {
	componentStack?: string | null;
	digest?: string | null;
};

/**
 * Props for the {@link LexicalErrorBoundary} component.
 */
export type LexicalErrorBoundaryProps = {
	children: OctaneNode;
	fallback?: OctaneNode;
	onError: (error: Error, info: ErrorInfo) => void;
};

export function LexicalErrorBoundary(props: LexicalErrorBoundaryProps) @{
	<ErrorBoundary
		fallback={(error: unknown, _reset: VoidFunction) => {
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
