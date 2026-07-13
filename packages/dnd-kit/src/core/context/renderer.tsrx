import { memo, startTransition, useImperativeHandle, useMemo, useRef, useState } from 'octane';
import type { Renderer as AbstractRenderer } from '@dnd-kit/abstract';
import { useIsomorphicLayoutEffect } from '../../hooks/useIsomorphicLayoutEffect';

export type OctaneRenderer = {
	renderer: AbstractRenderer;
	trackRendering: (callback: () => void) => void;
};

function RendererImpl(props: { children: unknown; ref?: { current: OctaneRenderer | null } }) {
	const [transitionCount, setTransitionCount] = useState(0);
	const rendering = useRef<Promise<void> | null>(null);
	const resolver = useRef<(() => void) | null>(null);
	const renderer = useMemo<OctaneRenderer>(
		() => ({
			renderer: {
				get rendering() {
					return rendering.current ?? Promise.resolve();
				},
			},
			trackRendering(callback: () => void) {
				if (!rendering.current) {
					rendering.current = new Promise<void>((resolve) => {
						resolver.current = resolve;
					});
				}
				startTransition(() => {
					callback();
					setTransitionCount((count) => count + 1);
				});
			},
		}),
		[],
	);

	useIsomorphicLayoutEffect(() => {
		resolver.current?.();
		rendering.current = null;
	}, [props.children, transitionCount]);
	useImperativeHandle(props.ref, () => renderer);
	return null;
}

export const Renderer = memo(RendererImpl);
