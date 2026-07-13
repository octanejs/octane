// Ported from sonner@2.0.7 src/hooks.tsx. The guarded initializer is the one
// deliberate SSR adaptation: Octane's server runtime executes this component,
// while upstream assumes a client boundary owns it.
import { useEffect, useState } from 'octane';

export function useIsDocumentHidden(): boolean {
	const [isDocumentHidden, setIsDocumentHidden] = useState(
		typeof document === 'undefined' ? false : document.hidden,
	);

	useEffect(() => {
		const callback = (): void => setIsDocumentHidden(document.hidden);
		document.addEventListener('visibilitychange', callback);
		return () => window.removeEventListener('visibilitychange', callback);
	}, []);

	return isDocumentHidden;
}
