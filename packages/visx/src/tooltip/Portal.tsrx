import { createPortal, useEffect, useState } from 'octane';
import type { ReactNode } from 'react';

export type PortalProps = {
	/** Optional z-index to set on the Portal. */
	zIndex?: number | string;
	/** Content to render in the Portal. */
	children: NonNullable<ReactNode>;
};

/** Render within a portal using a declarative component API. */
export default function Portal({ zIndex, children }: PortalProps) {
	const [node, setNode] = useState<HTMLDivElement | null>(null);

	useEffect(() => {
		if (typeof document === 'undefined' || !document.body) return;
		const target = document.createElement('div');
		if (zIndex != null) target.style.zIndex = `${zIndex}`;
		document.body.append(target);
		setNode(target);
		return () => {
			target.remove();
		};
	}, [zIndex]);

	return node ? createPortal(children, node) : null;
}
