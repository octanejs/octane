// Port of util/usePrefersReducedMotion.ts — subscribes to the system
// `prefers-reduced-motion` preference; SSR-safe (false on the server).
import { useEffect, useState } from 'octane';
import { Global } from './Global';

export function usePrefersReducedMotion(): boolean {
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
		if (Global.isSsr) {
			return false;
		}
		if (!window.matchMedia) {
			return false;
		}
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	});
	useEffect(() => {
		if (!window.matchMedia) {
			return;
		}
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const handleChange = () => {
			setPrefersReducedMotion(mediaQuery.matches);
		};
		mediaQuery.addEventListener('change', handleChange);
		return () => {
			mediaQuery.removeEventListener('change', handleChange);
		};
	}, []);
	return prefersReducedMotion;
}
