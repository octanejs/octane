import { useContext, useMemo, useState } from 'octane';
import { ErrorBoundaryContext } from './context.ts';
import { subSlot } from './internal.ts';

export type UseErrorBoundaryApi = {
	error: unknown | null;
	resetBoundary: () => void;
	showBoundary: (error: unknown) => void;
};

export function useErrorBoundary(): UseErrorBoundaryApi;
export function useErrorBoundary(slot?: symbol): UseErrorBoundaryApi {
	const context = useContext(ErrorBoundaryContext);
	if (context === null) {
		throw new Error('ErrorBoundaryContext not found');
	}

	const [state, setState] = useState<
		{ error: unknown; hasError: true } | { error: null; hasError: false }
	>({ error: null, hasError: false }, subSlot(slot, 'state'));
	const api = useMemo(
		() => ({
			error: context.error,
			resetBoundary: () => {
				context.resetErrorBoundary();
				setState({ error: null, hasError: false });
			},
			showBoundary: (error: unknown) => setState({ error, hasError: true }),
		}),
		[context.error, context.resetErrorBoundary],
		subSlot(slot, 'api'),
	);

	if (state.hasError) throw state.error;
	return api;
}
