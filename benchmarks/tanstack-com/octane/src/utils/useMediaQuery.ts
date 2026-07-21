import * as React from 'octane';

export function useMediaQuery(query: string) {
	const [matches, setMatches] = React.useState(false);

	React.useEffect(() => {
		const mediaQueryList = window.matchMedia(query);
		const updateMatches = () => {
			setMatches(mediaQueryList.matches);
		};

		updateMatches();
		mediaQueryList.addEventListener('change', updateMatches);

		return () => {
			mediaQueryList.removeEventListener('change', updateMatches);
		};
	}, [query]);

	return matches;
}
