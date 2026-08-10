// Ported from sonner@2.0.7 src/hooks.tsx.
// Divergence note (sonner-ssr-visibility-guard): Octane's server runtime
// executes this component, so the document read is guarded while upstream
// assumes a client boundary owns it. Authenticated by the ordinary
// packages/sonner/tests/ssr/visibility-guard.test.ts contract (not parity evidence).
import { useEffect, useState } from 'octane';

export function useIsDocumentHidden(): boolean {
	const [isDocumentHidden, setIsDocumentHidden] = useState(
		typeof document === 'undefined' ? false : document.hidden,
	);

	useEffect(() => {
		const callback = (): void => setIsDocumentHidden(document.hidden);
		document.addEventListener('visibilitychange', callback);
		return () => document.removeEventListener('visibilitychange', callback);
	}, []);

	return isDocumentHidden;
}
