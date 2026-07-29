import { useRef } from 'octane';

export function useIsFirstRender() {
	const renderRef = useRef(true);

	if (renderRef.current === true) {
		renderRef.current = false;
		return true;
	}

	return renderRef.current;
}
