import { useEffect, useEffectEvent } from 'octane';

export function usePageLeave(onPageLeave: () => void) {
	const onPageLeaveEvent = useEffectEvent(onPageLeave);

	useEffect(() => {
		document.documentElement.addEventListener('mouseleave', onPageLeaveEvent);
		return () => document.documentElement.removeEventListener('mouseleave', onPageLeaveEvent);
	}, []);
}
