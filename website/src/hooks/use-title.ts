// Per-page document titles. Pages call useTitle('Octane — …') and the tab
// title follows client-side navigation; on unmount the default (home) title is
// restored, so routes that set nothing — the home page — fall back to the
// template's static <title>. Effects never run during SSR, so crawlers see the
// template title in the served HTML and this only refines it after hydration.
import { useEffect } from 'octane';

// Byte-identical to the template <title> in index.html, so restoring it after
// a page unmount cannot flicker a different default.
export const DEFAULT_TITLE = "Octane — React's programming model, compiled";

export function useTitle(title: string) {
	useEffect(() => {
		document.title = title;
		return () => {
			document.title = DEFAULT_TITLE;
		};
	}, [title]);
}
