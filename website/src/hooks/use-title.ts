// Per-page document titles. Pages call useTitle('Octane — …') and the tab
// title follows client-side navigation; on unmount the default (home) title is
// restored, so routes that set nothing — the home page — fall back to the
// root route's head title. Effects never run during SSR, so crawlers see the
// route head in the served HTML and this only refines it after hydration.
import { useEffect } from 'octane';

// Byte-identical to the root route's head title, so restoring it after a page
// unmount cannot flicker a different default.
export const DEFAULT_TITLE = "Octane — React's programming model, compiled";

export function useTitle(title: string) {
	useEffect(() => {
		document.title = title;
		return () => {
			document.title = DEFAULT_TITLE;
		};
	}, [title]);
}
