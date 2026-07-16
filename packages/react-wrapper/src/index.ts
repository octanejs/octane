/**
 * Use Octane components inside a React app — the reverse direction of
 * `@octanejs/react-compat`. The host renderer is real React: the wrapper
 * renders a container element into the React tree, mounts an Octane root into
 * it ({@link useOctaneRoot}), and bridges React children into the Octane
 * `children` hole ({@link useChildSlot}).
 *
 * Client-only: under React SSR the wrapper renders an empty container and
 * mounts Octane after hydration.
 */
import {
	createElement as reactCreateElement,
	useRef,
	type ComponentType,
	type CSSProperties,
	type ReactElement,
	type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { ComponentBody } from 'octane';
import { useOctaneRoot } from './use-octane-root.js';
import { isRenderableChildren, useChildSlot } from './use-child-slot.js';

/** A compiled Octane component (a `.tsrx` export, or any Octane component body). */
export type OctaneComponent<P = Record<string, unknown>> = ((props: P) => unknown) & {
	displayName?: string;
};

export interface OctaneWrapperProps<P = Record<string, unknown>> {
	/** The Octane component to mount. */
	component: OctaneComponent<P>;
	/** Props forwarded to the Octane component on every React commit. */
	props?: P;
	/**
	 * React children, bridged into the Octane component's `children` prop as a
	 * layout-neutral host slot. Overrides any `children` key in `props`.
	 */
	children?: ReactNode;
	/** Container tag rendered by React to host the Octane root. Default: 'div'. */
	as?: string;
	className?: string;
	style?: CSSProperties;
}

/**
 * Mount an Octane component inside a React tree.
 *
 * ```tsx
 * <OctaneWrapper component={Counter} props={{ start: 5 }} />
 *
 * <OctaneWrapper component={Panel} props={{ title: 'Settings' }}>
 *   <ReactSettingsForm />
 * </OctaneWrapper>
 * ```
 */
export function OctaneWrapper<P = Record<string, unknown>>(
	wrapperProps: OctaneWrapperProps<P>,
): ReactElement {
	const { component, props, children, as = 'div', className, style } = wrapperProps;
	const containerRef = useRef<HTMLElement | null>(null);
	const slot = useChildSlot();
	const hasChildren = isRenderableChildren(children);

	const octaneProps = hasChildren
		? { ...(props as object), children: slot.descriptor }
		: ((props ?? {}) as object);
	useOctaneRoot(containerRef, component as ComponentBody, octaneProps);

	// The portal is the container's only React child and renders no DOM in
	// place, so React never touches the Octane-managed nodes inside.
	return reactCreateElement(
		as,
		{ ref: containerRef, className, style },
		hasChildren && slot.target !== null ? createPortal(children, slot.target) : null,
	);
}

export interface WrapOctaneOptions {
	/** Container tag rendered by React to host the Octane root. Default: 'div'. */
	as?: string;
	className?: string;
	style?: CSSProperties;
	displayName?: string;
}

/**
 * Turn an Octane component into a first-class React component: props pass
 * through one-to-one and React children bridge into the Octane `children` prop.
 *
 * ```tsx
 * const Counter = wrapOctane(OctaneCounter);
 * <Counter start={5} />
 * ```
 */
export function wrapOctane<P extends Record<string, unknown> = Record<string, unknown>>(
	component: OctaneComponent<P>,
	options: WrapOctaneOptions = {},
): ComponentType<P & { children?: ReactNode }> {
	function Wrapped(allProps: P & { children?: ReactNode }): ReactElement {
		const { children, ...rest } = allProps;
		return reactCreateElement(OctaneWrapper as ComponentType<OctaneWrapperProps<P>>, {
			component,
			props: rest as unknown as P,
			children,
			as: options.as,
			className: options.className,
			style: options.style,
		});
	}
	Wrapped.displayName =
		options.displayName ?? `Octane(${component.displayName ?? (component.name || 'Component')})`;
	return Wrapped;
}
