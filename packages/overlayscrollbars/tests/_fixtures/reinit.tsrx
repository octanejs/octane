import { useRef } from 'octane';
import { OverlayScrollbars } from 'overlayscrollbars';
import { useOverlayScrollbars } from '../../src/index.ts';

export function ReinitButton() @{
	const instanceRef = useRef<OverlayScrollbars | null>(null);
	const [initialize, instance] = useOverlayScrollbars();

	function onClick(event: Event) {
		initialize(event.currentTarget as HTMLElement);
		if (instanceRef.current) {
			if (instanceRef.current !== instance()) {
				throw new Error('re-initialization replaced a live instance');
			}
		}
		instanceRef.current = instance();
		if (instanceRef.current !== instance()) {
			throw new Error('instance() drifted after initialize');
		}
	}

	<button onClick={onClick}>initialize</button>
}
