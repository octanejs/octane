/** @jsxImportSource octane */
import { useEffect, useState } from 'octane';

/** Overlay-shaped root: mount effect + updatable label, for pauseUpdates exemption. */
export function InspectOverlayEffect(props: {
	onMountEffect?: () => void;
	expose?: (set: (n: number) => void) => void;
}) {
	const [count, setCount] = useState(0);
	props.expose?.(setCount);
	useEffect(() => {
		props.onMountEffect?.();
	}, []);
	return (
		<span data-testid="overlay-effect" data-count={count}>
			{count as unknown as string}
		</span>
	);
}
