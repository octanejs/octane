import { useCallback, useRef, useState } from 'octane';

export interface UseHoverReturnValue<T extends HTMLElement = any> {
	hovered: boolean;
	ref: React.RefCallback<T | null>;
}

export function useHover<T extends HTMLElement = any>(): UseHoverReturnValue<T> {
	const [hovered, setHovered] = useState(false);
	const previousNode = useRef<HTMLElement | null>(null);

	const handleMouseEnter = useCallback(() => {
		setHovered(true);
	}, []);

	const handleMouseLeave = useCallback(() => {
		setHovered(false);
	}, []);

	const ref: React.RefCallback<T | null> = useCallback(
		(node) => {
			if (previousNode.current) {
				previousNode.current.removeEventListener('mouseenter', handleMouseEnter);
				previousNode.current.removeEventListener('mouseleave', handleMouseLeave);
			}

			if (node) {
				node.addEventListener('mouseenter', handleMouseEnter);
				node.addEventListener('mouseleave', handleMouseLeave);
			}

			previousNode.current = node;

			return () => {
				node?.removeEventListener('mouseenter', handleMouseEnter);
				node?.removeEventListener('mouseleave', handleMouseLeave);
				if (previousNode.current === node) {
					previousNode.current = null;
					// Ref detaches run before replacement attaches. Defer the reset
					// so a replacement in the same commit can preserve hover state.
					queueMicrotask(() => {
						if (previousNode.current === null) {
							setHovered(false);
						}
					});
				}
			};
		},
		[handleMouseEnter, handleMouseLeave],
	);

	return { ref, hovered };
}

export namespace useHover {
	export type ReturnValue<T extends HTMLElement> = UseHoverReturnValue<T>;
}
