import { IS_DEV } from '../utils/devEnvironment.ts';

const OFFSETS = Array.from({ length: 100 }, (_, index) => index * 100);

// Upstream returns a memo component cast to an element, which
// React cannot render. It only mounts when ENABLE_DEVMODE is switched on in
// source, so this renders the offset ruler that code describes.
export function DevNumbers() {
	if (!IS_DEV) {
		return null;
	}

	return (
		<>
			@for (const offset of OFFSETS; key offset) {
				<div
					style={{
						height: 100,
						pointerEvents: 'none',
						position: 'absolute',
						top: offset,
						width: '100%',
					}}
				>
					<div style={{ color: 'red' }}>{String(offset)}</div>
				</div>
			}
		</>
	);
}
