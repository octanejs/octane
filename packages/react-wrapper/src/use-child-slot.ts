import { useRef, useState, type ReactNode } from 'react';
import { createElement as octaneCreateElement } from 'octane';

export interface ChildSlot {
	/** Octane element descriptor to pass as the component's `children` prop. */
	descriptor: unknown;
	/** The live slot element once Octane has mounted it — the portal target. */
	target: Element | null;
}

// `display: contents` keeps the slot out of layout, so bridged children behave
// as direct children of whatever the Octane component renders around
// `{children}`.
const CHILD_SLOT_STYLE = { display: 'contents' } as const;

/**
 * The children half of the bridge: Octane renders a host slot, React portals
 * its children into it.
 *
 * The descriptor is minted ONCE per wrapper instance — identity is the
 * invariant. A stable ref callback means Octane never re-attaches it, and a
 * stable element descriptor makes Octane bail out of reconciling the slot on
 * re-renders: the portal content React parks inside is foreign to Octane's
 * reconciler and would be swept out by a fresh descriptor.
 */
export function useChildSlot(): ChildSlot {
	const [target, setTarget] = useState<Element | null>(null);
	const descriptor = useRef<unknown>(null);
	descriptor.current ??= octaneCreateElement('span', {
		ref: (el: Element | null) => setTarget(el),
		style: CHILD_SLOT_STYLE,
	});
	return { descriptor: descriptor.current, target };
}

/** React ignores boolean/nullish children; mirror that so `{cond && <X/>}` composes. */
export function isRenderableChildren(children: ReactNode): boolean {
	return children != null && typeof children !== 'boolean';
}
