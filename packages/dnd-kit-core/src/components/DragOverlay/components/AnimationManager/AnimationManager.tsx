/** @jsxImportSource octane */
import { cloneElement, descriptorChildren, useState } from 'octane';
import type { ElementDescriptor } from 'octane';
import { useIsomorphicLayoutEffect, usePrevious } from '@octanejs/dnd-kit-utilities';

import type { UniqueIdentifier } from '../../../../types';

export type Animation = (key: UniqueIdentifier, node: HTMLElement) => Promise<void> | void;

export interface Props {
	animation: Animation;
	children: ElementDescriptor | null;
}

// The overlay is cloned after it unmounts, so compiled call sites must pass
// it as an element descriptor rather than a compiled children block.
export const AnimationManager = descriptorChildren(function AnimationManager({
	animation,
	children,
}: Props) {
	const [clonedChildren, setClonedChildren] = useState<ElementDescriptor | null>(null);
	const [element, setElement] = useState<HTMLElement | null>(null);
	const previousChildren = usePrevious(children);

	if (!children && !clonedChildren && previousChildren) {
		setClonedChildren(previousChildren);
	}

	useIsomorphicLayoutEffect(() => {
		if (!element) {
			return;
		}

		const key = clonedChildren?.key;
		const id = clonedChildren?.props.id;

		if (key == null || id == null) {
			setClonedChildren(null);
			return;
		}

		Promise.resolve(animation(id, element)).then(() => {
			setClonedChildren(null);
		});
	}, [animation, clonedChildren, element]);

	return (
		<>
			{children}
			{clonedChildren ? cloneElement(clonedChildren, { ref: setElement }) : null}
		</>
	);
});
